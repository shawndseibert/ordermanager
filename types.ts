
export interface Order {
  id: string;
  lineNumber: string;
  vendorCode: string;
  customerName: string;
  description: string;
  estNum: string;
  orderNum: string;
  orderDate: string;
  expectedRecvDate: string;
  status: string;
}

export interface OCRResult {
  orders: Omit<Order, 'id' | 'description'>[];
}

export interface PendingImport {
  newOrder: Order;
  isDuplicate: boolean;
  existingId?: string;
}
