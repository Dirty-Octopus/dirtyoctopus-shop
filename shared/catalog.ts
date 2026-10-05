// 价格由服务端使用此目录决定，绝不接受浏览器传入的金额。
export const products = {
  "spectral-corruptor": {
    id: "spectral-corruptor",
    name: "Spectral Corruptor",
    amount_cents: 9990,
    currency: "CNY",
  },
} as const;
export const product = products["spectral-corruptor"];
export const statuses = [
  "PENDING_PAYMENT",
  "PAYMENT_REFERENCE_SUBMITTED",
  "PAYMENT_VERIFIED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof statuses)[number];
export const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "等待付款",
  PAYMENT_REFERENCE_SUBMITTED: "付款信息已提交，等待人工核验",
  PAYMENT_VERIFIED: "付款已人工核验，等待发送激活码",
  COMPLETED: "已完成，激活码已通过 QQ / 微信发送",
  CANCELLED: "订单已取消",
  REFUNDED: "已人工退款",
};
export interface CustomerOrder {
  id: string;
  product_id: string;
  product_name: string;
  amount_cents: number;
  currency: string;
  status: OrderStatus;
  wechat_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  payment_reference_submitted_at: string | null;
  payment_verified_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
}
export interface AdminOrder extends CustomerOrder {
  admin_note: string;
}
export const orderIdPattern = /^DO-[A-F0-9]{16}$/;
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const transactionPattern = /^[A-Za-z0-9_-]{10,64}$/;
export function money(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}
