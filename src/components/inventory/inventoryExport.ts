import * as XLSX from 'xlsx';
import type { InventoryRequestWithItems } from '@/hooks/useInventoryRequests';

// Weekly sheet export columns:
// Branch | Department | Date | Item code | Item name | Remarks | Stock |
// Min stock | Recommended order | Order request | Note | Submitted by | Owner status
export function exportRequestsToXlsx(requests: InventoryRequestWithItems[]) {
  const rows: any[] = [];
  for (const r of requests) {
    for (const it of r.items as any[]) {
      const ci = it.inventory_control_items ?? null;
      rows.push({
        Branch: r.branch_name ?? '',
        Department: r.department,
        Date: r.request_date,
        'Item code': it.item_code ?? '',
        'Item name': it.item_name,
        Remarks: ci?.remarks ?? '',
        Stock: it.actual_stock ?? '',
        'Min stock': ci?.min_stock ?? '',
        'Recommended order': ci?.recommended_order ?? '',
        'Order request': it.approved_qty ?? it.requested_qty ?? '',
        Note: it.note ?? '',
        'Submitted by': r.staff_name ?? '',
        'Owner status': r.status,
      });
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Weekly inventory');
  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `weekly_inventory_${ts}.xlsx`);
}