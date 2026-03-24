-- Single source of truth for frontend RBAC: organization + branch access via auth.uid().
-- Run in Supabase SQL editor or migration. branch.id is TEXT in this schema.
--
-- Postgres does not allow CREATE OR REPLACE when the return type (or certain signature
-- changes) differs from the existing function — drop first.
--
-- SECURITY (SECURITY DEFINER)
-- - These functions run as the table owner (definer), so RLS on organization_members,
--   branch_members, and branches is NOT applied inside the function body. Access control
--   is enforced explicitly: every branch uses auth.uid() and never trusts client input
--   as the current user id.
-- - search_path = public prevents search_path hijacking in the definer context.
-- - Grant EXECUTE only to authenticated (and optionally service_role). Do not grant to anon.
-- - If you add joins to other tables, ensure they cannot leak rows across tenants.
--
-- Tab / multi-org: the app aligns activeOrganizationId to the URL org; expect a short
-- loading state while setActiveOrganizationId + branch sync run after navigation.

DROP FUNCTION IF EXISTS public.get_my_organization_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_branch_access(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_branch_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_accessible_branches() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_organization_access(p_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN jsonb_build_object('ok', false, 'code', 'not_authenticated')
    WHEN NOT EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.organization_id = p_organization_id
    ) THEN jsonb_build_object(
      'ok', true,
      'allowed', false,
      'organization_role', null,
      'source', null
    )
    ELSE (
      SELECT jsonb_build_object(
        'ok', true,
        'allowed', true,
        'organization_role', om.role,
        'source', 'organization_members'
      )
      FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.organization_id = p_organization_id
      LIMIT 1
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_branch_access(p_branch_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_org_role text;
  v_branch_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  SELECT b.organization_id INTO v_org_id FROM public.branches b WHERE b.id = p_branch_id;
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
  WHERE bm.user_id = auth.uid() AND bm.branch_id = p_branch_id;

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
    SELECT DISTINCT b.id AS bid
    FROM public.organization_members om
    JOIN public.branches b ON b.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND lower(trim(om.role)) IN ('owner', 'admin')
  LOOP
    IF NOT (r.bid = ANY(ids)) THEN
      ids := array_append(ids, r.bid);
    END IF;
  END LOOP;

  FOR r IN
    SELECT bm.branch_id FROM public.branch_members bm WHERE bm.user_id = auth.uid()
  LOOP
    IF NOT (r.branch_id = ANY(ids)) THEN
      ids := array_append(ids, r.branch_id);
    END IF;
  END LOOP;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('branch_id', bm.branch_id, 'role', bm.role) ORDER BY bm.branch_id),
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

REVOKE ALL ON FUNCTION public.get_my_organization_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_branch_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_accessible_branches() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_organization_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_branch_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_branches() TO authenticated;
