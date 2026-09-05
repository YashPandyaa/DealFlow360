// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting DealFlow360 Database Seed...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Seed Users (Idempotent upserts)
  console.log('👤 Seeding Users...');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dealflow360.com' },
    update: {},
    create: {
      email: 'admin@dealflow360.com',
      passwordHash,
      name: 'Admin User',
      role: 'ADMIN',
      teamId: 'MANAGEMENT'
    }
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@dealflow360.com' },
    update: {},
    create: {
      email: 'manager@dealflow360.com',
      passwordHash,
      name: 'Sarah Manager',
      role: 'MANAGER',
      teamId: 'MANAGEMENT'
    }
  });

  const finance = await prisma.user.upsert({
    where: { email: 'finance@dealflow360.com' },
    update: {},
    create: {
      email: 'finance@dealflow360.com',
      passwordHash,
      name: 'Frank Finance',
      role: 'FINANCE',
      teamId: 'FINANCE'
    }
  });

  const repAlice = await prisma.user.upsert({
    where: { email: 'rep.alice@dealflow360.com' },
    update: {},
    create: {
      email: 'rep.alice@dealflow360.com',
      passwordHash,
      name: 'Alice Rep',
      role: 'REP',
      teamId: 'TEAM-EAST'
    }
  });

  const repBob = await prisma.user.upsert({
    where: { email: 'rep.bob@dealflow360.com' },
    update: {},
    create: {
      email: 'rep.bob@dealflow360.com',
      passwordHash,
      name: 'Bob Rep',
      role: 'REP',
      teamId: 'TEAM-WEST'
    }
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@acme.com' },
    update: {},
    create: {
      email: 'customer@acme.com',
      passwordHash,
      name: 'Acme Procurement',
      role: 'CUSTOMER',
      isPortalUser: true
    }
  });

  // 2. Seed Products
  console.log('📦 Seeding Products...');
  const server = await prisma.product.upsert({
    where: { sku: 'SERVER-RACK-01' },
    update: { basePrice: 5000.0, marginPercent: 30.0, category: 'Hardware' },
    create: {
      sku: 'SERVER-RACK-01',
      name: 'Enterprise Server Rack',
      description: 'High-density 42U rack server with redundant power',
      category: 'Hardware',
      basePrice: 5000.0,
      marginPercent: 30.0
    }
  });

  const gateway = await prisma.product.upsert({
    where: { sku: 'IOT-GW-01' },
    update: { basePrice: 500.0, marginPercent: 40.0, category: 'Hardware' },
    create: {
      sku: 'IOT-GW-01',
      name: 'IoT Gateway Hub',
      description: 'Industrial edge gateway with multi-protocol support',
      category: 'Hardware',
      basePrice: 500.0,
      marginPercent: 40.0
    }
  });

  const sensor = await prisma.product.upsert({
    where: { sku: 'SENSOR-PK-01' },
    update: { basePrice: 100.0, marginPercent: 25.0, category: 'Hardware' },
    create: {
      sku: 'SENSOR-PK-01',
      name: 'High-Speed Sensor Pack',
      description: 'Wireless sensor bundle (deliberately short-stocked)',
      category: 'Hardware',
      basePrice: 100.0,
      marginPercent: 25.0
    }
  });

  const saas = await prisma.product.upsert({
    where: { sku: 'SAAS-PLAT-01' },
    update: { basePrice: 150.0, marginPercent: 80.0, category: 'Software' },
    create: {
      sku: 'SAAS-PLAT-01',
      name: 'DealFlow Platform SaaS',
      description: 'Monthly cloud telemetry and CPQ analytics platform',
      category: 'Software',
      basePrice: 150.0,
      marginPercent: 80.0
    }
  });

  const warranty = await prisma.product.upsert({
    where: { sku: 'SUPP-PREM-3YR' },
    update: { basePrice: 300.0, marginPercent: 70.0, category: 'Service' },
    create: {
      sku: 'SUPP-PREM-3YR',
      name: '3-Year Premium Support',
      description: '24/7 dedicated engineering and SLA warranty',
      category: 'Service',
      basePrice: 300.0,
      marginPercent: 70.0
    }
  });

  // 3. Seed Warehouses & Stock Levels
  console.log('🏭 Seeding Warehouses & Stock Inventory...');
  const whEast = await prisma.warehouse.upsert({
    where: { code: 'WH-EAST' },
    update: { name: 'Warehouse East (Boston)' },
    create: {
      name: 'Warehouse East (Boston)',
      code: 'WH-EAST',
      location: 'Boston, MA',
      capacity: 500,
      isActive: true
    }
  });

  const whWest = await prisma.warehouse.upsert({
    where: { code: 'WH-WEST' },
    update: { name: 'Warehouse West (San Francisco)' },
    create: {
      name: 'Warehouse West (San Francisco)',
      code: 'WH-WEST',
      location: 'San Francisco, CA',
      capacity: 750,
      isActive: true
    }
  });

  const whCentral = await prisma.warehouse.upsert({
    where: { code: 'WH-CENTRAL' },
    update: { name: 'Warehouse Central (Chicago)' },
    create: {
      name: 'Warehouse Central (Chicago)',
      code: 'WH-CENTRAL',
      location: 'Chicago, IL',
      capacity: 1000,
      isActive: true
    }
  });

  // Seed inventory levels
  // Warehouse East: 10 Servers, 20 Gateways, 3 Sensors (short-stocked)
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whEast.id, productId: server.id } },
    update: { quantity: 10, allocatedQty: 0 },
    create: { warehouseId: whEast.id, productId: server.id, quantity: 10, allocatedQty: 0 }
  });
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whEast.id, productId: gateway.id } },
    update: { quantity: 20, allocatedQty: 0 },
    create: { warehouseId: whEast.id, productId: gateway.id, quantity: 20, allocatedQty: 0 }
  });
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whEast.id, productId: sensor.id } },
    update: { quantity: 3, allocatedQty: 0 },
    create: { warehouseId: whEast.id, productId: sensor.id, quantity: 3, allocatedQty: 0 }
  });

  // Warehouse West: 15 Servers, 25 Gateways, 4 Sensors (short-stocked)
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whWest.id, productId: server.id } },
    update: { quantity: 15, allocatedQty: 0 },
    create: { warehouseId: whWest.id, productId: server.id, quantity: 15, allocatedQty: 0 }
  });
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whWest.id, productId: gateway.id } },
    update: { quantity: 25, allocatedQty: 0 },
    create: { warehouseId: whWest.id, productId: gateway.id, quantity: 25, allocatedQty: 0 }
  });
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whWest.id, productId: sensor.id } },
    update: { quantity: 4, allocatedQty: 0 },
    create: { warehouseId: whWest.id, productId: sensor.id, quantity: 4, allocatedQty: 0 }
  });

  // Warehouse Central: 8 Servers, 15 Gateways, 0 Sensors
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whCentral.id, productId: server.id } },
    update: { quantity: 8, allocatedQty: 0 },
    create: { warehouseId: whCentral.id, productId: server.id, quantity: 8, allocatedQty: 0 }
  });
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whCentral.id, productId: gateway.id } },
    update: { quantity: 15, allocatedQty: 0 },
    create: { warehouseId: whCentral.id, productId: gateway.id, quantity: 15, allocatedQty: 0 }
  });
  await prisma.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: whCentral.id, productId: sensor.id } },
    update: { quantity: 0, allocatedQty: 0 },
    create: { warehouseId: whCentral.id, productId: sensor.id, quantity: 0, allocatedQty: 0 }
  });

  // 4. Seed Subscription Plans
  console.log('💳 Seeding Subscription Plans...');
  const monthlyPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Pro SaaS Monthly' } });
  if (!monthlyPlan) {
    await prisma.subscriptionPlan.create({
      data: {
        name: 'Pro SaaS Monthly',
        billingCycle: 'MONTHLY',
        productId: saas.id,
        pricePerCycle: 150.0,
        isActive: true
      }
    });
  }

  const annualPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Enterprise SaaS Annual' } });
  if (!annualPlan) {
    await prisma.subscriptionPlan.create({
      data: {
        name: 'Enterprise SaaS Annual',
        billingCycle: 'YEARLY',
        productId: saas.id,
        pricePerCycle: 1500.0,
        isActive: true
      }
    });
  }

  // 5. Seed Upsell Rules
  console.log('⚡ Seeding Upsell Rules...');
  await prisma.upsellRule.deleteMany(); // Refresh pairing rules
  await prisma.upsellRule.createMany({
    data: [
      {
        triggerProductId: server.id,
        suggestedProductId: warranty.id,
        coPurchaseScore: 0.95,
        isPromoted: true,
        isActive: true
      },
      {
        triggerProductId: server.id,
        suggestedProductId: gateway.id,
        coPurchaseScore: 0.85,
        isPromoted: false,
        isActive: true
      },
      {
        triggerProductId: gateway.id,
        suggestedProductId: sensor.id,
        coPurchaseScore: 0.9,
        isPromoted: false,
        isActive: true
      }
    ]
  });

  // 6. Seed Discount Governance
  console.log('⚖️ Seeding Discount Governance (Tiers, Ceilings, Chains)...');
  await prisma.discountTier.upsert({
    where: { customerTier: 'GOLD' },
    update: { maxDiscountPercent: 15.0 },
    create: { customerTier: 'GOLD', maxDiscountPercent: 15.0 }
  });
  await prisma.discountTier.upsert({
    where: { customerTier: 'SILVER' },
    update: { maxDiscountPercent: 10.0 },
    create: { customerTier: 'SILVER', maxDiscountPercent: 10.0 }
  });
  await prisma.discountTier.upsert({
    where: { customerTier: 'BRONZE' },
    update: { maxDiscountPercent: 5.0 },
    create: { customerTier: 'BRONZE', maxDiscountPercent: 5.0 }
  });

  await prisma.categoryDiscountCeiling.upsert({
    where: { category: 'Hardware' },
    update: { maxDiscountPercent: 10.0 },
    create: { category: 'Hardware', maxDiscountPercent: 10.0 }
  });
  await prisma.categoryDiscountCeiling.upsert({
    where: { category: 'Software' },
    update: { maxDiscountPercent: 20.0 },
    create: { category: 'Software', maxDiscountPercent: 20.0 }
  });
  await prisma.categoryDiscountCeiling.upsert({
    where: { category: 'Service' },
    update: { maxDiscountPercent: 15.0 },
    create: { category: 'Service', maxDiscountPercent: 15.0 }
  });

  await prisma.approvalChain.deleteMany();
  await prisma.approvalChain.createMany({
    data: [
      {
        minRiskScore: 0.0,
        maxRiskScore: 5.0,
        requiredApprovers: 'MANAGER'
      },
      {
        minRiskScore: 5.01,
        maxRiskScore: null,
        requiredApprovers: 'MANAGER_THEN_FINANCE'
      }
    ]
  });

  console.log('✅ DealFlow360 Database Seeding Complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
