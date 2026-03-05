// Script to create all remaining business scenario fixtures
// Run: node create-all-scenario-fixtures.js

const fs = require('fs');
const path = require('path');

const fixturesDir = __dirname;

// Helper to read existing fixture
function readFixture(name) {
  const filePath = path.join(fixturesDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Helper to write fixture
function writeFixture(name, data) {
  const filePath = path.join(fixturesDir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Created: ${name}.json`);
}

// Create cafe_multi_branch fixtures (2 branches, both cafes)
function createCafeMultiFixtures() {
  const cafeGood = readFixture('cafe-good');
  const cafeBad = readFixture('cafe-bad');
  const cafeMixed = readFixture('cafe-mixed');
  
  // Good: 2 healthy cafes
  const cafeMultiGood = {
    organizationId: 'org-cafe-multi-good-001',
    branches: [
      { ...cafeGood.branches[0], branchId: 'br-cafe-multi-good-001', branchName: 'Healthy Café - Downtown' },
      { ...cafeGood.branches[0], branchId: 'br-cafe-multi-good-002', branchName: 'Healthy Café - Suburb' },
    ],
    description: 'Multi-branch café group with 2 healthy branches'
  };
  writeFixture('cafe-multi-good', cafeMultiGood);
  
  // Bad: 2 struggling cafes
  const cafeMultiBad = {
    organizationId: 'org-cafe-multi-bad-001',
    branches: [
      { ...cafeBad.branches[0], branchId: 'br-cafe-multi-bad-001', branchName: 'Struggling Café - Downtown' },
      { ...cafeBad.branches[0], branchId: 'br-cafe-multi-bad-002', branchName: 'Struggling Café - Suburb' },
    ],
    description: 'Multi-branch café group with 2 struggling branches'
  };
  writeFixture('cafe-multi-bad', cafeMultiBad);
  
  // Mixed: 1 healthy + 1 struggling
  const cafeMultiMixed = {
    organizationId: 'org-cafe-multi-mixed-001',
    branches: [
      { ...cafeGood.branches[0], branchId: 'br-cafe-multi-mixed-001', branchName: 'Healthy Café - Downtown' },
      { ...cafeMixed.branches[0], branchId: 'br-cafe-multi-mixed-002', branchName: 'Moderate Café - Suburb' },
    ],
    description: 'Multi-branch café group with mixed performance'
  };
  writeFixture('cafe-multi-mixed', cafeMultiMixed);
}

// Create restaurant_single fixtures (similar to cafe but branchType: restaurant)
function createRestaurantSingleFixtures() {
  const cafeGood = readFixture('cafe-good');
  const cafeBad = readFixture('cafe-bad');
  const cafeMixed = readFixture('cafe-mixed');
  
  // Good
  const restaurantSingleGood = {
    organizationId: 'org-restaurant-single-good-001',
    branches: [{
      ...cafeGood.branches[0],
      branchId: 'br-restaurant-single-good-001',
      branchName: 'Healthy Restaurant - Central',
      branchType: 'restaurant'
    }],
    description: 'Healthy single restaurant branch'
  };
  writeFixture('restaurant-single-good', restaurantSingleGood);
  
  // Bad
  const restaurantSingleBad = {
    organizationId: 'org-restaurant-single-bad-001',
    branches: [{
      ...cafeBad.branches[0],
      branchId: 'br-restaurant-single-bad-001',
      branchName: 'Struggling Restaurant - Downtown',
      branchType: 'restaurant'
    }],
    description: 'Struggling single restaurant branch'
  };
  writeFixture('restaurant-single-bad', restaurantSingleBad);
  
  // Mixed
  const restaurantSingleMixed = {
    organizationId: 'org-restaurant-single-mixed-001',
    branches: [{
      ...cafeMixed.branches[0],
      branchId: 'br-restaurant-single-mixed-001',
      branchName: 'Moderate Restaurant - Suburb',
      branchType: 'restaurant'
    }],
    description: 'Moderate single restaurant branch'
  };
  writeFixture('restaurant-single-mixed', restaurantSingleMixed);
}

// Create restaurant_multi_branch fixtures
function createRestaurantMultiFixtures() {
  const restaurantSingleGood = readFixture('restaurant-single-good');
  const restaurantSingleBad = readFixture('restaurant-single-bad');
  const restaurantSingleMixed = readFixture('restaurant-single-mixed');
  
  // Good
  const restaurantMultiGood = {
    organizationId: 'org-restaurant-multi-good-001',
    branches: [
      { ...restaurantSingleGood.branches[0], branchId: 'br-restaurant-multi-good-001', branchName: 'Healthy Restaurant - Downtown' },
      { ...restaurantSingleGood.branches[0], branchId: 'br-restaurant-multi-good-002', branchName: 'Healthy Restaurant - Suburb' },
    ],
    description: 'Multi-branch restaurant group with 2 healthy branches'
  };
  writeFixture('restaurant-multi-good', restaurantMultiGood);
  
  // Bad
  const restaurantMultiBad = {
    organizationId: 'org-restaurant-multi-bad-001',
    branches: [
      { ...restaurantSingleBad.branches[0], branchId: 'br-restaurant-multi-bad-001', branchName: 'Struggling Restaurant - Downtown' },
      { ...restaurantSingleBad.branches[0], branchId: 'br-restaurant-multi-bad-002', branchName: 'Struggling Restaurant - Suburb' },
    ],
    description: 'Multi-branch restaurant group with 2 struggling branches'
  };
  writeFixture('restaurant-multi-bad', restaurantMultiBad);
  
  // Mixed
  const restaurantMultiMixed = {
    organizationId: 'org-restaurant-multi-mixed-001',
    branches: [
      { ...restaurantSingleGood.branches[0], branchId: 'br-restaurant-multi-mixed-001', branchName: 'Healthy Restaurant - Downtown' },
      { ...restaurantSingleMixed.branches[0], branchId: 'br-restaurant-multi-mixed-002', branchName: 'Moderate Restaurant - Suburb' },
    ],
    description: 'Multi-branch restaurant group with mixed performance'
  };
  writeFixture('restaurant-multi-mixed', restaurantMultiMixed);
}

// Create hotel_with_fnb fixtures (hotel + cafe/restaurant branches)
function createHotelWithFnbFixtures() {
  const hotelGood = readFixture('hotel-good');
  const hotelBad = readFixture('hotel-bad');
  const hotelMixed = readFixture('hotel-mixed');
  const cafeGood = readFixture('cafe-good');
  const cafeBad = readFixture('cafe-bad');
  const cafeMixed = readFixture('cafe-mixed');
  
  // Good: healthy hotel + healthy cafe
  const hotelWithFnbGood = {
    organizationId: 'org-hotel-fnb-good-001',
    branches: [
      { ...hotelGood.branches[0], branchId: 'br-hotel-fnb-good-001', branchName: 'Healthy Hotel - Downtown' },
      { ...cafeGood.branches[0], branchId: 'br-hotel-fnb-good-002', branchName: 'Healthy Café - On-Site' },
    ],
    description: 'Hotel with F&B: healthy hotel + healthy café'
  };
  writeFixture('hotel-with-fnb-good', hotelWithFnbGood);
  
  // Bad: struggling hotel + struggling cafe
  const hotelWithFnbBad = {
    organizationId: 'org-hotel-fnb-bad-001',
    branches: [
      { ...hotelBad.branches[0], branchId: 'br-hotel-fnb-bad-001', branchName: 'Struggling Hotel - Downtown' },
      { ...cafeBad.branches[0], branchId: 'br-hotel-fnb-bad-002', branchName: 'Struggling Café - On-Site' },
    ],
    description: 'Hotel with F&B: struggling hotel + struggling café'
  };
  writeFixture('hotel-with-fnb-bad', hotelWithFnbBad);
  
  // Mixed: healthy hotel + moderate cafe
  const hotelWithFnbMixed = {
    organizationId: 'org-hotel-fnb-mixed-001',
    branches: [
      { ...hotelGood.branches[0], branchId: 'br-hotel-fnb-mixed-001', branchName: 'Healthy Hotel - Downtown' },
      { ...cafeMixed.branches[0], branchId: 'br-hotel-fnb-mixed-002', branchName: 'Moderate Café - On-Site' },
    ],
    description: 'Hotel with F&B: healthy hotel + moderate café'
  };
  writeFixture('hotel-with-fnb-mixed', hotelWithFnbMixed);
}

// Run all
console.log('Creating all business scenario fixtures...\n');
createCafeMultiFixtures();
createRestaurantSingleFixtures();
createRestaurantMultiFixtures();
createHotelWithFnbFixtures();
console.log('\nDone! Created all remaining fixtures.');
