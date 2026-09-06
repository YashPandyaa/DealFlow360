// warehouses/inventory.service.ts
import { prisma } from '../shared/prisma';

export interface GetStockFilter {
  warehouseId?: string;
  productId?: string;
  search?: string;
  status?: string; // ALL, IN_STOCK, LOW_STOCK, OUT_OF_STOCK, RESERVED
}

export interface CreateStockInput {
  warehouseId: string;
  productId: string;
  quantity: number;
  reorderLevel?: number;
  reservedQty?: number;
}

export interface UpdateStockInput {
  quantity?: number;
  reservedQty?: number;
  reorderLevel?: number;
  reason?: string;
}

export class InventoryService {
  /**
   * Helper to derive stock status string consistently
   */
  deriveStockStatus(quantity: number, reservedQty: number, reorderLevel: number): 'OUT_OF_STOCK' | 'RESERVED' | 'LOW_STOCK' | 'IN_STOCK' {
    const available = Math.max(0, quantity - reservedQty);
    if (quantity === 0) return 'OUT_OF_STOCK';
    if (available === 0 && reservedQty > 0) return 'RESERVED';
    if (available <= reorderLevel) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /**
   * 1. List all stock items with product & warehouse info, calculated available stock & status
   */
  async getAllStock(filter?: GetStockFilter) {
    const where: any = {};

    if (filter?.warehouseId && filter.warehouseId !== 'ALL') {
      where.warehouseId = filter.warehouseId;
    }

    if (filter?.productId && filter.productId !== 'ALL') {
      where.productId = filter.productId;
    }

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { product: { name: { contains: q } } },
        { product: { sku: { contains: q } } },
        { warehouse: { name: { contains: q } } },
        { warehouse: { code: { contains: q } } }
      ];
    }

    const stockItems = await prisma.warehouseStock.findMany({
      where,
      include: {
        warehouse: true,
        product: true
      },
      orderBy: [
        { warehouse: { name: 'asc' } },
        { product: { name: 'asc' } }
      ]
    });

    const mapped = stockItems.map((item) => {
      const availableQty = Math.max(0, item.quantity - item.reservedQty - item.allocatedQty);
      const stockStatus = this.deriveStockStatus(item.quantity, item.reservedQty + item.allocatedQty, item.reorderLevel);

      return {
        ...item,
        quantityOnHand: item.quantity,
        reservedQty: item.reservedQty + item.allocatedQty,
        availableQty,
        stockStatus
      };
    });

    if (filter?.status && filter.status !== 'ALL') {
      const targetStatus = filter.status.toUpperCase();
      return mapped.filter((item) => item.stockStatus === targetStatus);
    }

    return mapped;
  }

  /**
   * 2. Get single stock record by unique stockId
   */
  async getStockById(id: string) {
    if (!id || typeof id !== 'string') {
      const err = new Error('Stock record ID is required');
      (err as any).statusCode = 400;
      throw err;
    }

    const stock = await prisma.warehouseStock.findUnique({
      where: { id },
      include: {
        warehouse: true,
        product: true
      }
    });

    if (!stock) {
      const err = new Error(`Warehouse stock record with ID '${id}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    const availableQty = Math.max(0, stock.quantity - stock.reservedQty - stock.allocatedQty);
    const stockStatus = this.deriveStockStatus(stock.quantity, stock.reservedQty + stock.allocatedQty, stock.reorderLevel);

    return {
      ...stock,
      quantityOnHand: stock.quantity,
      reservedQty: stock.reservedQty + stock.allocatedQty,
      availableQty,
      stockStatus
    };
  }

  /**
   * 3. Comprehensive database inventory summary calculation
   */
  async getInventorySummary() {
    const warehouses = await prisma.warehouse.findMany({ where: { isActive: true } });
    const products = await prisma.product.findMany({ where: { status: 'ACTIVE' } });
    const stockRecords = await prisma.warehouseStock.findMany({
      include: { warehouse: true, product: true }
    });

    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let reservedCount = 0;

    for (const item of stockRecords) {
      const reserved = item.reservedQty + item.allocatedQty;
      const available = Math.max(0, item.quantity - reserved);

      totalStock += item.quantity;
      totalReserved += reserved;
      totalAvailable += available;

      const status = this.deriveStockStatus(item.quantity, reserved, item.reorderLevel);
      if (status === 'OUT_OF_STOCK') outOfStockCount++;
      else if (status === 'RESERVED') reservedCount++;
      else if (status === 'LOW_STOCK') lowStockCount++;
    }

    return {
      totalProducts: products.length,
      totalWarehouses: warehouses.length,
      totalStockItems: stockRecords.length,
      totalStockOnHand: totalStock,
      totalReservedStock: totalReserved,
      totalAvailableStock: totalAvailable,
      lowStockCount,
      outOfStockCount,
      reservedCount
    };
  }

  /**
   * 4. Create or upsert stock record scoped by warehouseId + productId
   */
  async createStock(data: CreateStockInput, userId?: string) {
    if (!data.warehouseId || !data.productId) {
      const err = new Error('warehouseId and productId are required');
      (err as any).statusCode = 400;
      throw err;
    }

    const wh = await prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
    if (!wh) {
      const err = new Error(`Warehouse with ID '${data.warehouseId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    const prod = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!prod) {
      const err = new Error(`Product with ID '${data.productId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    const qty = Number(data.quantity);
    if (isNaN(qty) || qty < 0) {
      const err = new Error('Quantity must be a valid non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    const reorderLevel = data.reorderLevel !== undefined ? Number(data.reorderLevel) : 10;
    if (isNaN(reorderLevel) || reorderLevel < 0) {
      const err = new Error('Reorder level must be a valid non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    const existing = await prisma.warehouseStock.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId
        }
      }
    });

    const stock = await prisma.warehouseStock.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId
        }
      },
      create: {
        warehouseId: data.warehouseId,
        productId: data.productId,
        quantity: Math.floor(qty),
        reservedQty: data.reservedQty !== undefined ? Math.floor(Number(data.reservedQty)) : 0,
        reorderLevel: Math.floor(reorderLevel)
      },
      update: {
        quantity: Math.floor(qty),
        reorderLevel: Math.floor(reorderLevel)
      },
      include: {
        warehouse: true,
        product: true
      }
    });

    // Write AuditLog
    await prisma.auditLog.create({
      data: {
        entityType: 'WarehouseStock',
        entityId: stock.id,
        userId: userId || null,
        action: existing ? 'STOCK_UPDATED' : 'STOCK_CREATED',
        details: JSON.stringify({
          warehouseId: wh.id,
          warehouseName: wh.name,
          productId: prod.id,
          productName: prod.name,
          oldQuantity: existing ? existing.quantity : 0,
          newQuantity: stock.quantity,
          reorderLevel: stock.reorderLevel
        })
      }
    }).catch(() => {});

    return this.getStockById(stock.id);
  }

  /**
   * 5. Update stock by unique stockId
   */
  async updateStock(id: string, data: UpdateStockInput, userId?: string) {
    const existing = await this.getStockById(id);

    const updateData: any = {};

    if (data.quantity !== undefined) {
      const q = Number(data.quantity);
      if (isNaN(q) || q < 0) {
        const err = new Error('Quantity must be a valid non-negative number');
        (err as any).statusCode = 400;
        throw err;
      }
      // Check if new quantity would fall below current reserved/allocated quantity
      const currentReservedTotal = existing.reservedQty;
      if (q < currentReservedTotal) {
        const err = new Error(`Cannot set stock quantity to ${q} because ${currentReservedTotal} units are currently reserved/allocated.`);
        (err as any).statusCode = 400;
        throw err;
      }
      updateData.quantity = Math.floor(q);
    }

    if (data.reservedQty !== undefined) {
      const r = Number(data.reservedQty);
      if (isNaN(r) || r < 0) {
        const err = new Error('Reserved quantity must be a valid non-negative number');
        (err as any).statusCode = 400;
        throw err;
      }
      const targetQuantity = updateData.quantity !== undefined ? updateData.quantity : existing.quantity;
      if (r > targetQuantity) {
        const err = new Error(`Reserved quantity (${r}) cannot exceed on-hand quantity (${targetQuantity}).`);
        (err as any).statusCode = 400;
        throw err;
      }
      updateData.reservedQty = Math.floor(r);
    }

    if (data.reorderLevel !== undefined) {
      const rl = Number(data.reorderLevel);
      if (isNaN(rl) || rl < 0) {
        const err = new Error('Reorder level must be a valid non-negative number');
        (err as any).statusCode = 400;
        throw err;
      }
      updateData.reorderLevel = Math.floor(rl);
    }

    const updated = await prisma.warehouseStock.update({
      where: { id },
      data: updateData,
      include: {
        warehouse: true,
        product: true
      }
    });

    // Write AuditLog
    await prisma.auditLog.create({
      data: {
        entityType: 'WarehouseStock',
        entityId: id,
        userId: userId || null,
        action: 'STOCK_UPDATED',
        reason: data.reason || 'Manual Inventory Adjustment',
        details: JSON.stringify({
          warehouseName: existing.warehouse.name,
          productName: existing.product.name,
          oldQuantity: existing.quantity,
          newQuantity: updated.quantity,
          oldReserved: existing.reservedQty,
          newReserved: updated.reservedQty
        })
      }
    }).catch(() => {});

    return this.getStockById(id);
  }

  /**
   * 6. Delete stock by unique stockId with referential integrity check
   */
  async deleteStock(id: string, userId?: string) {
    const existing = await this.getStockById(id);

    // Check active allocations referencing this stock item
    const activeAllocationsCount = await prisma.stockAllocation.count({
      where: {
        warehouseId: existing.warehouseId,
        productId: existing.productId,
        status: { in: ['ALLOCATED', 'RESERVED'] }
      }
    });

    if (activeAllocationsCount > 0 || existing.reservedQty > 0 || existing.allocatedQty > 0) {
      const err = new Error(
        `Stock record '${id}' for product '${existing.product.name}' in '${existing.warehouse.name}' cannot be deleted because it is referenced by an active fulfillment or allocation.`
      );
      (err as any).statusCode = 409;
      throw err;
    }

    // Safely delete stock item
    await prisma.warehouseStock.delete({ where: { id } });

    // Write AuditLog
    await prisma.auditLog.create({
      data: {
        entityType: 'WarehouseStock',
        entityId: id,
        userId: userId || null,
        action: 'STOCK_DELETED',
        details: JSON.stringify({
          warehouseName: existing.warehouse.name,
          productName: existing.product.name,
          lastQuantity: existing.quantity
        })
      }
    }).catch(() => {});

    return {
      message: `Warehouse stock record for '${existing.product.name}' at '${existing.warehouse.name}' deleted successfully.`,
      id
    };
  }

  /**
   * 7. Transactional stock reservation
   */
  async reserveStock(warehouseId: string, productId: string, qtyToReserve: number) {
    if (qtyToReserve <= 0) return;

    return prisma.$transaction(async (tx) => {
      const stock = await tx.warehouseStock.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } }
      });

      if (!stock) {
        throw new Error(`Stock record not found for warehouse '${warehouseId}' and product '${productId}'`);
      }

      const available = stock.quantity - stock.reservedQty - stock.allocatedQty;
      if (qtyToReserve > available) {
        throw new Error(`Insufficient available stock to reserve. Requested ${qtyToReserve}, Available ${available}`);
      }

      return tx.warehouseStock.update({
        where: { id: stock.id },
        data: { reservedQty: { increment: qtyToReserve } }
      });
    });
  }

  /**
   * 8. Transactional stock release
   */
  async releaseStock(warehouseId: string, productId: string, qtyToRelease: number) {
    if (qtyToRelease <= 0) return;

    return prisma.$transaction(async (tx) => {
      const stock = await tx.warehouseStock.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } }
      });

      if (!stock) return;

      const decrementVal = Math.min(stock.reservedQty, qtyToRelease);
      return tx.warehouseStock.update({
        where: { id: stock.id },
        data: { reservedQty: { decrement: decrementVal } }
      });
    });
  }

  /**
   * 9. Bulk add / replenish stock quantity across all active products and warehouses
   */
  async replenishAllStock(qtyAmount: number = 50, userId?: string) {
    const activeProducts = await prisma.product.findMany({ where: { status: 'ACTIVE' } });
    const activeWarehouses = await prisma.warehouse.findMany({ where: { isActive: true } });

    let updatedCount = 0;
    for (const prod of activeProducts) {
      for (const wh of activeWarehouses) {
        await prisma.warehouseStock.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: wh.id,
              productId: prod.id
            }
          },
          create: {
            warehouseId: wh.id,
            productId: prod.id,
            quantity: Math.max(10, qtyAmount),
            reorderLevel: 10
          },
          update: {
            quantity: {
              increment: qtyAmount
            }
          }
        });
        updatedCount++;
      }
    }

    await prisma.auditLog.create({
      data: {
        entityType: 'WarehouseStock',
        entityId: 'ALL',
        userId: userId || null,
        action: 'BULK_STOCK_REPLENISHED',
        details: JSON.stringify({
          qtyAdded: qtyAmount,
          totalRecordsUpdated: updatedCount
        })
      }
    }).catch(() => {});

    return {
      message: `Successfully added ${qtyAmount} stock quantity to all ${activeProducts.length} active products across ${activeWarehouses.length} active warehouses (${updatedCount} stock locations updated).`,
      productsCount: activeProducts.length,
      warehousesCount: activeWarehouses.length,
      updatedCount
    };
  }
}

export const inventoryService = new InventoryService();
