// warehouses/warehouses.service.ts
import { prisma } from '../shared/prisma';

export interface AllocationSuggestion {
  productId: string;
  productName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  quantity: number;
  status: 'ALLOCATED' | 'BACKORDERED';
}

export class WarehousesService {
  // ==========================================================================
  // 1. Warehouse Management
  // ==========================================================================

  async createWarehouse(data: {
    name: string;
    code: string;
    location?: string;
    capacity?: number;
    isActive?: boolean;
  }) {
    if (!data.name || !data.code) {
      throw new Error('name and code are required');
    }

    return prisma.warehouse.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        location: data.location || null,
        capacity: data.capacity !== undefined ? Number(data.capacity) : null,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true
      }
    });
  }

  async getWarehouses() {
    return prisma.warehouse.findMany({
      include: {
        stockItems: {
          include: {
            product: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  async getWarehouseById(id: string) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        stockItems: {
          include: {
            product: true
          }
        },
        stockAllocations: true
      }
    });

    if (!warehouse) {
      throw new Error(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  // ==========================================================================
  // 2. Stock Inventory Management
  // ==========================================================================

  async setStock(warehouseId: string, productId: string, quantity: number) {
    await this.getWarehouseById(warehouseId);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    return prisma.warehouseStock.upsert({
      where: {
        warehouseId_productId: {
          warehouseId,
          productId
        }
      },
      create: {
        warehouseId,
        productId,
        quantity: Math.max(0, quantity),
        allocatedQty: 0
      },
      update: {
        quantity: Math.max(0, quantity)
      },
      include: {
        warehouse: true,
        product: true
      }
    });
  }

  async getStockForProduct(productId: string) {
    return prisma.warehouseStock.findMany({
      where: {
        productId,
        warehouse: { isActive: true }
      },
      include: {
        warehouse: true,
        product: true
      }
    });
  }

  // ==========================================================================
  // 3. Intelligent Multi-Warehouse Split & Fulfillment Engine
  // ==========================================================================

  /**
   * Computes optimal fulfillment split across warehouses for a quotation.
   * Handles single warehouse, multi-warehouse split, and backorder cases.
   */
  async suggestFulfillmentSplit(quotationId: string): Promise<{
    quotation: any;
    suggestions: AllocationSuggestion[];
    fullyAllocated: boolean;
    totalRequested: number;
    totalAllocated: number;
    totalBackordered: number;
  }> {
    const quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: quotationId }, { quoteNumber: quotationId }]
      },
      include: {
        lines: {
          include: {
            product: true
          }
        }
      }
    });

    if (!quotation) {
      throw new Error(`Quotation ${quotationId} not found`);
    }

    const suggestions: AllocationSuggestion[] = [];
    let totalRequested = 0;
    let totalAllocated = 0;
    let totalBackordered = 0;

    for (const line of quotation.lines) {
      const requiredQty = line.quantity;
      totalRequested += requiredQty;

      // Find stock across active warehouses
      const stockRecords = await prisma.warehouseStock.findMany({
        where: {
          productId: line.productId,
          warehouse: { isActive: true }
        },
        include: {
          warehouse: true,
          product: true
        }
      });

      // Calculate available quantity in each warehouse
      const availableWarehouses = stockRecords
        .map((s) => ({
          warehouseId: s.warehouseId,
          warehouseName: s.warehouse.name,
          warehouseCode: s.warehouse.code,
          available: Math.max(0, s.quantity - s.allocatedQty)
        }))
        .filter((w) => w.available > 0)
        .sort((a, b) => b.available - a.available); // Highest stock first

      // Case 1: Check if a single warehouse can fulfill the entire line item
      const singleBestWarehouse = availableWarehouses.find((w) => w.available >= requiredQty);
      if (singleBestWarehouse) {
        suggestions.push({
          productId: line.productId,
          productName: line.product?.name || 'Product',
          warehouseId: singleBestWarehouse.warehouseId,
          warehouseName: singleBestWarehouse.warehouseName,
          warehouseCode: singleBestWarehouse.warehouseCode,
          quantity: requiredQty,
          status: 'ALLOCATED'
        });
        totalAllocated += requiredQty;
        continue;
      }

      // Case 2: Split across multiple warehouses
      let remainingToAllocate = requiredQty;

      for (const wh of availableWarehouses) {
        if (remainingToAllocate <= 0) break;

        const allocateFromThis = Math.min(wh.available, remainingToAllocate);
        suggestions.push({
          productId: line.productId,
          productName: line.product?.name || 'Product',
          warehouseId: wh.warehouseId,
          warehouseName: wh.warehouseName,
          warehouseCode: wh.warehouseCode,
          quantity: allocateFromThis,
          status: 'ALLOCATED'
        });

        totalAllocated += allocateFromThis;
        remainingToAllocate -= allocateFromThis;
      }

      // Case 3: Short-stocked (Backorder remaining items)
      if (remainingToAllocate > 0) {
        suggestions.push({
          productId: line.productId,
          productName: line.product?.name || 'Product',
          warehouseId: null,
          warehouseName: 'Backorder Center',
          warehouseCode: 'BACKORDER',
          quantity: remainingToAllocate,
          status: 'BACKORDERED'
        });
        totalBackordered += remainingToAllocate;
      }
    }

    return {
      quotation,
      suggestions,
      fullyAllocated: totalBackordered === 0,
      totalRequested,
      totalAllocated,
      totalBackordered
    };
  }

  /**
   * Executes fulfillment by generating stock allocations and updating inventory levels.
   */
  async fulfillQuotation(quotationId: string) {
    const splitResult = await this.suggestFulfillmentSplit(quotationId);
    const { quotation, suggestions, fullyAllocated, totalRequested, totalAllocated, totalBackordered } = splitResult;

    // Remove any previous allocations for idempotency
    const existingAllocations = await prisma.stockAllocation.findMany({
      where: { quotationId: quotation.id }
    });

    for (const ea of existingAllocations) {
      if (ea.status === 'ALLOCATED') {
        // Rollback allocatedQty on stock item
        await prisma.warehouseStock.updateMany({
          where: {
            warehouseId: ea.warehouseId,
            productId: ea.productId
          },
          data: {
            allocatedQty: {
              decrement: ea.quantity
            }
          }
        });
      }
    }

    await prisma.stockAllocation.deleteMany({
      where: { quotationId: quotation.id }
    });

    // Write new allocations and reserve stock
    const createdAllocations = [];
    for (const sug of suggestions) {
      if (sug.warehouseId) {
        const allocation = await prisma.stockAllocation.create({
          data: {
            quotationId: quotation.id,
            warehouseId: sug.warehouseId,
            productId: sug.productId,
            quantity: sug.quantity,
            status: sug.status
          }
        });

        // Reserve stock
        await prisma.warehouseStock.updateMany({
          where: {
            warehouseId: sug.warehouseId,
            productId: sug.productId
          },
          data: {
            allocatedQty: {
              increment: sug.quantity
            }
          }
        });

        createdAllocations.push({
          ...allocation,
          productName: sug.productName,
          warehouseName: sug.warehouseName,
          warehouseCode: sug.warehouseCode
        });
      } else {
        // Backorder record with a primary/default warehouse
        const defaultWarehouse = await prisma.warehouse.findFirst();
        if (defaultWarehouse) {
          const allocation = await prisma.stockAllocation.create({
            data: {
              quotationId: quotation.id,
              warehouseId: defaultWarehouse.id,
              productId: sug.productId,
              quantity: sug.quantity,
              status: 'BACKORDERED'
            }
          });

          createdAllocations.push({
            ...allocation,
            productName: sug.productName,
            warehouseName: 'Backorder Center',
            warehouseCode: 'BACKORDER'
          });
        }
      }
    }

    // Update Quotation status to ALLOCATED or READY_FOR_FULFILLMENT
    const newStatus = fullyAllocated ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED';
    await prisma.quotation.update({
      where: { id: quotation.id },
      data: { status: newStatus }
    });

    // Write AuditLog entry
    await prisma.auditLog.create({
      data: {
        entityType: 'Quotation',
        entityId: quotation.id,
        action: 'FULFILLMENT_SPLIT_GENERATED',
        details: JSON.stringify({
          fullyAllocated,
          totalRequested,
          totalAllocated,
          totalBackordered,
          allocationsCount: createdAllocations.length
        })
      }
    });

    return {
      quotationId: quotation.id,
      quoteNumber: quotation.quoteNumber,
      status: newStatus,
      fulfillmentSummary: {
        fullyAllocated,
        totalItemsRequested: totalRequested,
        allocatedItems: totalAllocated,
        backorderedItems: totalBackordered
      },
      allocations: createdAllocations
    };
  }

  async getAllocationsForQuotation(quotationId: string) {
    const quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: quotationId }, { quoteNumber: quotationId }]
      }
    });

    if (!quotation) {
      throw new Error(`Quotation ${quotationId} not found`);
    }

    const allocations = await prisma.stockAllocation.findMany({
      where: { quotationId: quotation.id },
      include: {
        warehouse: true
      }
    });

    return {
      quotationId: quotation.id,
      quoteNumber: quotation.quoteNumber,
      allocations: allocations.map((a) => ({
        id: a.id,
        productId: a.productId,
        warehouseId: a.warehouseId,
        warehouseName: a.warehouse?.name || 'Warehouse',
        warehouseCode: a.warehouse?.code || 'WH',
        quantity: a.quantity,
        status: a.status,
        createdAt: a.createdAt
      }))
    };
  }
}

export const warehousesService = new WarehousesService();
