// Replace this example with an order from your own product/database.
// Each local session represents a fresh copy of this order. See README for persistence.
export const order = Object.freeze({
  number: "1042",
  customer: { name: "Alex Morgan", country: "PT" },
  item: { name: "Website maintenance", type: "SERVICE", unitPrice: 10 },
  quantity: 1,
});

export const draftPath = `/orders/${order.number}/draft`;
