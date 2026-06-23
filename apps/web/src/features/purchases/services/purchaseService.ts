import { createSupplier, updateSupplier, softDeleteSupplier, getSuppliers } from './supplierService';
import { createOrder, updateOrder, softDeleteOrder, confirmOrder, cancelOrder, getOrders, getOrderById, getPriceHistory } from './orderService';
import { receiveOrder } from './receivingService';
import { paySupplierDebt, reconcileSupplierBalance, getSupplierPayments, getPendingPayables } from './paymentService';

export const purchaseService = {
  createSupplier,
  updateSupplier,
  softDeleteSupplier,
  getSuppliers,
  createOrder,
  updateOrder,
  softDeleteOrder,
  confirmOrder,
  receiveOrder,
  cancelOrder,
  getOrders,
  getOrderById,
  getPriceHistory,
  paySupplierDebt,
  reconcileSupplierBalance,
  getSupplierPayments,
  getPendingPayables,
};
