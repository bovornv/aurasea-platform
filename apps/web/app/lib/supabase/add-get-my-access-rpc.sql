-- Single source of truth for frontend RBAC: organization + branch access via auth.uid().
-- Run in Supabase SQL editor or migration.
--
-- ID typing: production may use UUID for organizations.id, branches.id, branch_members.branch_id,
-- branch_members.user_id, organization_members.user_id. All RPC parameters from PostgREST/JS are
-- text; this file casts explicitly so there is never uuid = text inside the function body.
--
-- Postgres does not allow CREATE OR REPLACE when the return type (or certain signature
-- changes) differs from the existing function — drop first.
--
-- SECURITY (SECURITY DEFINER): see comments in prior revisions; grant EXECUTE to authenticated only.

DROP FUNCTION IF EXISTS public.get_my_organization_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_organization_access(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_branch_access(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_branch_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_accessible_branches() CASCADE;

-- Org id from the app is always a string; cast to uuid inside (invalid → not allowed).
CREATE OR REPLACE FUNCTION public.get_my_organization_access(p_organization_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  IF p_organization_id IS NULL OR trim(p_organization_id) = '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'allowed', false,
      'organization_role', null,
      'source', null
    );
  END IF;

  BEGIN
    v_org := trim(p_organization_id)::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object(
        'ok', true,
        'allowed', false,
        'organization_role', null,
        'source', null,
        'reason', 'invalid_organization_id'
      );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.organization_id = v_org
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'allowed', false,
      'organization_role', null,
      'source', null
    );
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'allowed', true,
      'organization_role', om.role,
      'source', 'organization_members'
    )
    FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.organization_id = v_org
    LIMIT 1
  );
END;
$$;

-- Branch id from the app is a string (slug or uuid string). Compare via ::text on DB columns.
CREATE OR REPLACE FUNCTION public.get_my_branch_access(p_branch_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_org_id uuid;
  v_org_role text;
  v_branch_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  v_key := trim(coalesce(p_branch_id, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', true, 'allowed', false, 'reason', 'empty_branch_id');
  END IF;

  SELECT b.organization_id INTO v_org_id
  FROM public.branches b
  WHERE b.id::text = v_key;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'allowed', false, 'reason', 'branch_not_found');
  END IF;

  SELECT om.role INTO v_org_role
  FROM public.organization_members om
  WHERE om.user_id = auth.uid() AND om.organization_id = v_org_id;

  IF lower(trim(coalesce(v_org_role, ''))) IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'allowed', true,
      'effective_role', v_org_role,
      'source', 'organization',
      'organization_id', v_org_id
    );
  END IF;

  SELECT bm.role INTO v_branch_role
  FROM public.branch_members bm
  WHERE bm.user_id = auth.uid() AND bm.branch_id::text = v_key;

  IF v_branch_role IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'allowed', true,
      'effective_role', v_branch_role,
      'source', 'branch',
      'organization_id', v_org_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'allowed', false, 'organization_id', v_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_accessible_branches()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids text[] := ARRAY[]::text[];
  r record;
  m jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  FOR r IN
    SELECT DISTINCT b.id::text AS bid
    FROM public.organization_members om
    JOIN public.branches b ON b.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND lower(trim(om.role)) IN ('owner', 'admin')
  LOOP
    IF r.bid IS NOT NULL AND NOT (r.bid = ANY(ids)) THEN
      ids := array_append(ids, r.bid);
    END IF;
  END LOOP;

  FOR r IN
    SELECT bm.branch_id::text AS bid
    FROM public.branch_members bm
    WHERE bm.user_id = auth.uid()
  LOOP
    IF r.bid IS NOT NULL AND NOT (r.bid = ANY(ids)) THEN
      ids := array_append(ids, r.bid);
    END IF;
  END LOOP;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('branch_id', bm.branch_id::text, 'role', bm.role)
      ORDER BY bm.branch_id::text
    ),
    '[]'::jsonb
  )
  INTO m
  FROM public.branch_members bm
  WHERE bm.user_id = auth.uid();

  RETURN jsonb_build_object(
    'ok', true,
    'branch_ids', coalesce(to_jsonb(ids), '[]'::jsonb),
    'branch_memberships', m
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_organization_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_branch_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_accessible_branches() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_organization_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_branch_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_branches() TO authenticated;
