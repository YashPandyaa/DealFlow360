// warehouses/fulfillment.service.ts
import { prisma } from '../shared/prisma';
import { addBillingCycles } from '../subscriptions/subscriptions.service';

export interface ManualAllocationInput {
  productId: string;
  warehouseId: string | null; // null indicates Backorder
  quantity: number;
}

export interface SplitSuggestionItem {
  productId: string;
  productName: string;
  warehouseId: string | null;
  warehouseName: string;
  warehouseCode: string;
  quantity: number;
  status: 'ALLOCATED' | 'BACKORDERED';
  unitShippingCost: number;
}

export class FulfillmentService {
  /**
   * 1. Converts a confirmed Quotation into a Sales Order and initializes fulfillment.
   */
  async createSalesOrderFromQuotation(quotationId: string) {
    const quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: quotationId }, { quoteNumber: quotationId }]
      },
      include: {
        lines: {
          include: { product: true }
        }
      }
    });

    if (!quotation) {
      throw new Error(`Quotation '${quotationId}' not found`);
    }

    if (
      quotation.status !== 'CONFIRMED' &&
      quotation.status !== 'APPROVED' &&
      quotation.status !== 'READY_FOR_FULFILLMENT'
    ) {
      throw new Error(`Quotation status is '${quotation.status}'. Must be CONFIRMED or APPROVED to create a Sales Order.`);
    }

    // Check if SalesOrder already exists for this quotation
    const existingOrder = await prisma.salesOrder.findFirst({
      where: { quotationId: quotation.id },
      include: {
        lines: { include: { product: true } },
        allocations: { include: { warehouse: true } },
        backorders: { include: { product: true, warehouse: true } }
      }
    });

    if (existingOrder) {
      return existingOrder;
    }

    const orderNumber = `SO-${quotation.quoteNumber.replace(/^QT-/, '')}`;

    const salesOrder = await prisma.salesOrder.create({
      data: {
        orderNumber,
        quotationId: quotation.id,
        customerId: quotation.customerId || null,
        customerName: quotation.customerName || 'Standard Customer',
        status: 'PENDING',
        totalAmount: quotation.totalAmount,
        lines: {
          create: quotation.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            totalPrice: l.totalPrice,
            isRecurring:
              ['SOFTWARE', 'SAAS', 'SERVICES', 'SUBSCRIPTIONS', 'SERVICE'].includes(
                (l.product?.category || '').toUpperCase()
              ) || l.product?.billingType === 'RECURRING'
          }))
        }
      },
      include: {
        lines: { include: { product: true } }
      }
    });

    // Auto-create Subscriptions for any recurring lines with associated SubscriptionPlans
    for (const line of salesOrder.lines) {
      if (line.isRecurring && line.product) {
        let plan = null;
        if (line.product.subscriptionPlanId) {
          plan = await prisma.subscriptionPlan.findUnique({
            where: { id: line.product.subscriptionPlanId }
          });
        }
        if (!plan) {
          plan = await prisma.subscriptionPlan.findFirst({
            where: { productId: line.productId, isActive: true }
          });
        }
        if (plan) {
          const startDate = new Date();
          const currentPeriodStart = startDate;
          const currentPeriodEnd = addBillingCycles(startDate, plan.billingCycle, 1);

          const sub = await prisma.subscription.create({
            data: {
              salesOrderId: salesOrder.id,
              quotationId: quotation.id,
              customerId: quotation.customerId || null,
              planId: plan.id,
              productId: line.productId,
              quantity: line.quantity,
              price: line.unitPrice,
              discount: line.discount,
              billingFrequency: plan.billingCycle,
              startDate,
              nextBillingDate: currentPeriodEnd,
              status: 'ACTIVE',
              currentPeriodStart,
              currentPeriodEnd
            }
          });

          const cycleCount = plan.billingCycle === 'YEARLY' ? 5 : plan.billingCycle === 'QUARTERLY' ? 4 : 12;
          for (let i = 0; i < cycleCount; i++) {
            const bDate = addBillingCycles(startDate, plan.billingCycle, i);
            await prisma.billingScheduleEntry.create({
              data: {
                subscriptionId: sub.id,
                billingDate: bDate,
                amount: line.totalPrice || line.unitPrice * line.quantity,
                status: 'UPCOMING',
                description: `${plan.name} - Cycle ${i + 1}`
              }
            });
          }
        }
      }
    }

    // Run auto-split suggestion & execute initial fulfillment
    await this.executeFulfillmentAllocation(salesOrder.id);

    return prisma.salesOrder.findUnique({
      where: { id: salesOrder.id },
      include: {
        lines: { include: { product: true } },
        allocations: { include: { warehouse: true } },
        backorders: { include: { product: true, warehouse: true } }
      }
    });
  }

  /**
   * 2. Calculates optimal multi-warehouse fulfillment split using stock levels & shipping cost weightings.
   */
  async calculateOptimalFulfillmentSplit(salesOrderIdOrQuotationId: string) {
    let salesOrder = await prisma.salesOrder.findFirst({
      where: {
        OR: [
          { id: salesOrderIdOrQuotationId },
          { orderNumber: salesOrderIdOrQuotationId },
          { quotationId: salesOrderIdOrQuotationId }
        ]
      },
      include: {
        lines: { include: { product: true } }
      }
    });

    if (!salesOrder) {
      // Attempt to auto-create from quotation if quotationId passed
      const quotation = await prisma.quotation.findFirst({
        where: { OR: [{ id: salesOrderIdOrQuotationId }, { quoteNumber: salesOrderIdOrQuotationId }] }
      });
      if (quotation) {
        salesOrder = await this.createSalesOrderFromQuotation(quotation.id);
      }
    }

    if (!salesOrder) {
      throw new Error(`Sales Order with ID or Quotation '${salesOrderIdOrQuotationId}' not found`);
    }

    const suggestions: SplitSuggestionItem[] = [];
    let totalRequested = 0;
    let totalAllocated = 0;
    let totalBackordered = 0;
    const warehouseUsedSet = new Set<string>();
    let totalShippingCost = 0;

    for (const line of salesOrder.lines) {
      // Skip recurring subscription lines from physical warehouse stock check
      if (line.isRecurring) {
        continue;
      }

      const requiredQty = line.quantity;
      totalRequested += requiredQty;

      // Fetch stock across active warehouses
      const stockRecords = await prisma.warehouseStock.findMany({
        where: {
          productId: line.productId,
          warehouse: { isActive: true }
        },
        include: { warehouse: true, product: true }
      });

      // Discount current order's existing allocations to allow re-calculating / previewing splits idempotently
      const currentOrderAllocations = await prisma.stockAllocation.findMany({
        where: { salesOrderId: salesOrder.id, productId: line.productId, status: 'ALLOCATED' }
      });
      const currentAllocByWh = new Map<string, number>();
      for (const a of currentOrderAllocations) {
        if (a.warehouseId) {
          currentAllocByWh.set(a.warehouseId, (currentAllocByWh.get(a.warehouseId) || 0) + a.quantity);
        }
      }

      const candidateWarehouses = stockRecords
        .map((s) => {
          const selfAlloc = currentAllocByWh.get(s.warehouseId) || 0;
          const otherAllocated = Math.max(0, s.allocatedQty - selfAlloc);
          return {
            warehouseId: s.warehouseId,
            warehouseName: s.warehouse.name,
            warehouseCode: s.warehouse.code,
            weighting: s.warehouse.shippingCostWeighting || 1.0,
            available: Math.max(0, s.quantity - otherAllocated)
          };
        })
        .filter((w) => w.available > 0);

      // Strategy 1: Check if a single active warehouse can fulfill the entire line quantity
      const singleBestWarehouse = candidateWarehouses
        .filter((w) => w.available >= requiredQty)
        .sort((a, b) => a.weighting - b.weighting)[0]; // Lowest shipping cost weighting first

      if (singleBestWarehouse) {
        suggestions.push({
          productId: line.productId,
          productName: line.product.name,
          warehouseId: singleBestWarehouse.warehouseId,
          warehouseName: singleBestWarehouse.warehouseName,
          warehouseCode: singleBestWarehouse.warehouseCode,
          quantity: requiredQty,
          status: 'ALLOCATED',
          unitShippingCost: singleBestWarehouse.weighting * 10
        });
        totalAllocated += requiredQty;
        warehouseUsedSet.add(singleBestWarehouse.warehouseId);
        totalShippingCost += requiredQty * singleBestWarehouse.weighting * 10;
        continue;
      }

      // Strategy 2: Multi-warehouse split, prioritized by stock availability & lowest shipping cost weighting
      const sortedSplitCandidates = candidateWarehouses.sort((a, b) => {
        if (a.weighting !== b.weighting) return a.weighting - b.weighting;
        return b.available - a.available;
      });

      let remainingToAllocate = requiredQty;

      for (const wh of sortedSplitCandidates) {
        if (remainingToAllocate <= 0) break;

        const allocQty = Math.min(wh.available, remainingToAllocate);
        suggestions.push({
          productId: line.productId,
          productName: line.product.name,
          warehouseId: wh.warehouseId,
          warehouseName: wh.warehouseName,
          warehouseCode: wh.warehouseCode,
          quantity: allocQty,
          status: 'ALLOCATED',
          unitShippingCost: wh.weighting * 10
        });

        totalAllocated += allocQty;
        remainingToAllocate -= allocQty;
        warehouseUsedSet.add(wh.warehouseId);
        totalShippingCost += allocQty * wh.weighting * 10;
      }

      // Strategy 3: Backorder remaining unallocated quantity if stock is insufficient
      if (remainingToAllocate > 0) {
        suggestions.push({
          productId: line.productId,
          productName: line.product.name,
          warehouseId: null,
          warehouseName: 'Backorder Center',
          warehouseCode: 'BACKORDER',
          quantity: remainingToAllocate,
          status: 'BACKORDERED',
          unitShippingCost: 0
        });
        totalBackordered += remainingToAllocate;
      }
    }

    return {
      salesOrder,
      suggestions,
      fullyAllocated: totalBackordered === 0,
      totalRequested,
      totalAllocated,
      totalBackordered,
      estimatedShipmentCount: Math.max(1, warehouseUsedSet.size),
      estimatedShippingCost: Math.round(totalShippingCost * 100) / 100
    };
  }

  /**
   * 3. Executes stock allocation (or manual override) transactionally.
   */
  async executeFulfillmentAllocation(
    salesOrderId: string,
    manualAllocations?: ManualAllocationInput[]
  ) {
    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: {
        lines: { include: { product: true } },
        allocations: true,
        backorders: true
      }
    });

    if (!salesOrder) {
      throw new Error(`Sales Order '${salesOrderId}' not found`);
    }

    let finalAllocations: Array<{
      productId: string;
      warehouseId: string | null;
      quantity: number;
      status: 'ALLOCATED' | 'BACKORDERED';
    }> = [];

    let estimatedShipments = 1;
    let estimatedCost = 0;

    if (manualAllocations && manualAllocations.length > 0) {
      // Validate manual allocations against backend business rules
      for (const line of salesOrder.lines) {
        if (line.isRecurring) continue;

        const lineInputs = manualAllocations.filter((m) => m.productId === line.productId);
        const sumAllocatedAndBackordered = lineInputs.reduce((sum, item) => sum + item.quantity, 0);

        if (sumAllocatedAndBackordered !== line.quantity) {
          throw new Error(
            `Manual allocation invalid for product '${line.product.name}': Total allocated + backordered quantity (${sumAllocatedAndBackordered}) must equal ordered quantity (${line.quantity}).`
          );
        }

        for (const input of lineInputs) {
          if (input.quantity < 0) {
            throw new Error(`Invalid negative quantity (${input.quantity}) for product '${line.product.name}'.`);
          }

          if (input.warehouseId) {
            const wh = await prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
            if (!wh || !wh.isActive) {
              throw new Error(`Cannot allocate stock from inactive or non-existent warehouse '${input.warehouseId}'.`);
            }

            const stock = await prisma.warehouseStock.findUnique({
              where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } }
            });

            const available = stock ? Math.max(0, stock.quantity - stock.allocatedQty) : 0;
            if (input.quantity > available) {
              throw new Error(
                `Manual allocation exceeds available stock in ${wh.name}: Requested ${input.quantity}, Available ${available}.`
              );
            }
          }
        }
      }

      finalAllocations = manualAllocations.map((m) => ({
        productId: m.productId,
        warehouseId: m.warehouseId,
        quantity: m.quantity,
        status: m.warehouseId ? 'ALLOCATED' : 'BACKORDERED'
      }));
    } else {
      // Auto-suggested split
      const autoSplit = await this.calculateOptimalFulfillmentSplit(salesOrder.id);
      finalAllocations = autoSplit.suggestions.map((s) => ({
        productId: s.productId,
        warehouseId: s.warehouseId,
        quantity: s.quantity,
        status: s.status
      }));
      estimatedShipments = autoSplit.estimatedShipmentCount;
      estimatedCost = autoSplit.estimatedShippingCost;
    }

    // Rollback previous allocations idempotently
    for (const alloc of salesOrder.allocations) {
      if (alloc.warehouseId && alloc.status === 'ALLOCATED') {
        await prisma.warehouseStock.updateMany({
          where: { warehouseId: alloc.warehouseId, productId: alloc.productId },
          data: { allocatedQty: { decrement: alloc.quantity } }
        });
      }
    }

    await prisma.stockAllocation.deleteMany({ where: { salesOrderId: salesOrder.id } });
    await prisma.backorder.deleteMany({ where: { salesOrderId: salesOrder.id } });

    // Persist new allocations and create backorder records
    let totalAllocated = 0;
    let totalBackordered = 0;

    for (const item of finalAllocations) {
      if (item.quantity <= 0) continue;

      if (item.warehouseId && item.status === 'ALLOCATED') {
        await prisma.stockAllocation.create({
          data: {
            salesOrderId: salesOrder.id,
            quotationId: salesOrder.quotationId,
            warehouseId: item.warehouseId,
            productId: item.productId,
            quantity: item.quantity,
            status: 'ALLOCATED'
          }
        });

        await prisma.warehouseStock.updateMany({
          where: { warehouseId: item.warehouseId, productId: item.productId },
          data: { allocatedQty: { increment: item.quantity } }
        });

        totalAllocated += item.quantity;
      } else {
        // Backorder record
        const defaultWh = await prisma.warehouse.findFirst({ where: { isActive: true } });
        const lineObj = salesOrder.lines.find((l) => l.productId === item.productId);

        await prisma.backorder.create({
          data: {
            salesOrderId: salesOrder.id,
            salesOrderLineId: lineObj ? lineObj.id : null,
            quotationId: salesOrder.quotationId,
            productId: item.productId,
            warehouseId: defaultWh ? defaultWh.id : null,
            remainingQty: item.quantity,
            status: 'BACKORDERED'
          }
        });

        totalBackordered += item.quantity;
      }
    }

    // Determine updated SalesOrder fulfillment status
    let orderStatus = 'ALLOCATED';
    if (totalBackordered > 0 && totalAllocated > 0) {
      orderStatus = 'PARTIALLY_FULFILLED';
    } else if (totalBackordered > 0 && totalAllocated === 0) {
      orderStatus = 'BACKORDERED';
    } else if (totalBackordered === 0) {
      orderStatus = 'FULFILLED';
    }

    await prisma.salesOrder.update({
      where: { id: salesOrder.id },
      data: {
        status: orderStatus,
        estimatedShipmentCount: estimatedShipments,
        estimatedShippingCost: estimatedCost
      }
    });

    if (salesOrder.quotationId) {
      await prisma.quotation.update({
        where: { id: salesOrder.quotationId },
        data: { status: orderStatus === 'FULFILLED' ? 'READY_FOR_FULFILLMENT' : orderStatus }
      });
    }

    return prisma.salesOrder.findUnique({
      where: { id: salesOrder.id },
      include: {
        lines: { include: { product: true } },
        allocations: { include: { warehouse: true } },
        backorders: { include: { product: true, warehouse: true } }
      }
    });
  }

  /**
   * 4. Consolidates backordered items when new stock becomes available.
   */
  async consolidateBackorder(backorderId: string, warehouseIdInput?: string) {
    const backorder = await prisma.backorder.findUnique({
      where: { id: backorderId },
      include: {
        product: true,
        salesOrder: { include: { lines: true, allocations: true, backorders: true } }
      }
    });

    if (!backorder) {
      throw new Error(`Backorder '${backorderId}' not found`);
    }

    if (backorder.status === 'FULFILLED' || backorder.remainingQty <= 0) {
      throw new Error(`Backorder '${backorderId}' is already fulfilled`);
    }

    // Find active warehouse with available stock for this product
    const stockItems = await prisma.warehouseStock.findMany({
      where: {
        productId: backorder.productId,
        warehouse: { isActive: true }
      },
      include: { warehouse: true }
    });

    const targetStock = warehouseIdInput
      ? stockItems.find((s) => s.warehouseId === warehouseIdInput)
      : stockItems
          .map((s) => ({ ...s, available: Math.max(0, s.quantity - s.allocatedQty) }))
          .filter((s) => s.available > 0)
          .sort((a, b) => b.available - a.available)[0];

    if (!targetStock) {
      throw new Error(`No available stock in active warehouses to consolidate backorder for '${backorder.product.name}'.`);
    }

    const available = Math.max(0, targetStock.quantity - targetStock.allocatedQty);
    if (available <= 0) {
      throw new Error(`Warehouse '${targetStock.warehouse.name}' has 0 available stock for '${backorder.product.name}'.`);
    }

    const allocateQty = Math.min(available, backorder.remainingQty);
    const newRemaining = backorder.remainingQty - allocateQty;

    // Create StockAllocation
    await prisma.stockAllocation.create({
      data: {
        salesOrderId: backorder.salesOrderId,
        quotationId: backorder.quotationId,
        warehouseId: targetStock.warehouseId,
        productId: backorder.productId,
        quantity: allocateQty,
        status: 'ALLOCATED'
      }
    });

    // Reserve stock
    await prisma.warehouseStock.updateMany({
      where: { warehouseId: targetStock.warehouseId, productId: backorder.productId },
      data: { allocatedQty: { increment: allocateQty } }
    });

    // Update Backorder
    const updatedBackorder = await prisma.backorder.update({
      where: { id: backorder.id },
      data: {
        remainingQty: newRemaining,
        status: newRemaining === 0 ? 'FULFILLED' : 'BACKORDERED'
      },
      include: { product: true, warehouse: true }
    });

    // Re-evaluate SalesOrder status
    if (backorder.salesOrderId) {
      const remainingBackorders = await prisma.backorder.findMany({
        where: { salesOrderId: backorder.salesOrderId, status: 'BACKORDERED' }
      });

      const newOrderStatus = remainingBackorders.length === 0 ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      await prisma.salesOrder.update({
        where: { id: backorder.salesOrderId },
        data: { status: newOrderStatus }
      });
    }

    return {
      backorder: updatedBackorder,
      allocatedQuantity: allocateQty,
      remainingQuantity: newRemaining,
      warehouseName: targetStock.warehouse.name
    };
  }

  /**
   * 5. Gets all active backorders with product & sales order details.
   */
  async getBackorders() {
    return prisma.backorder.findMany({
      include: {
        product: true,
        warehouse: true,
        salesOrder: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const fulfillmentService = new FulfillmentService();
