// Historial.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { FaEdit, FaTrash, FaUndo } from "react-icons/fa";

export default function Historial({ almacenId: propAlmacenId }) {
  const navigate = useNavigate();
  const almacenId = propAlmacenId || localStorage.getItem("almacen_id");

  // Tabs
  const [tab, setTab] = useState("resumen");

  // Fechas
  const todayStr = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);
  const defaultFromStr = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - 11, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}-01`;
  }, []);
  const [startDate, setStartDate] = useState(defaultFromStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Quick range
  const [quickKey, setQuickKey] = useState("ult12");
  const applyQuickRange = (key) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startOfMonth = (d) => {
      const x = new Date(d);
      x.setDate(1);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const fmt = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };
    let s = new Date(now);
    if (key === "mes_actual") s = startOfMonth(now);
    else if (key === "ult3") s = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    else if (key === "ult6") s = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    else if (key === "ult12") s = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1));
    else if (key === "anio_actual") s = new Date(now.getFullYear(), 0, 1);
    setStartDate(fmt(s));
    setEndDate(fmt(now));
    setQuickKey(key);
  };
  const onChangeStart = (val) => { setStartDate(val); setQuickKey(null); };
  const onChangeEnd = (val) => { setEndDate(val); setQuickKey(null); };

  // Datos
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [verGrafico, setVerGrafico] = useState(true);

  // === COMPRAS: selección/edición/borrado/masivo/undo ===
  const [selectedCompras, setSelectedCompras] = useState(new Set());
  const [deletingCompras, setDeletingCompras] = useState(false);
  const [editingCompraId, setEditingCompraId] = useState(null);
  const [editCompraValues, setEditCompraValues] = useState({ nombre: "", proveedor: "", formaPago: "", total: "" });
  const [bulkCompraAction, setBulkCompraAction] = useState("none"); // none|formaPago|proveedor
  const [bulkCompraFormaPago, setBulkCompraFormaPago] = useState("");
  const [bulkCompraProveedor, setBulkCompraProveedor] = useState("");
  const [applyingBulkCompras, setApplyingBulkCompras] = useState(false);

  // === VENTAS: selección/edición/borrado/masivo/undo ===
  const [selectedVentas, setSelectedVentas] = useState(new Set());
  const [deletingVentas, setDeletingVentas] = useState(false);
  const [editingVentaId, setEditingVentaId] = useState(null);
  const [editVentaValues, setEditVentaValues] = useState({ nombre: "", formaPago: "", total: "" });
  const [bulkVentaAction, setBulkVentaAction] = useState("none"); // none|formaPago
  const [bulkVentaFormaPago, setBulkVentaFormaPago] = useState("");
  const [applyingBulkVentas, setApplyingBulkVentas] = useState(false);

  // UNDO (última acción de compras o ventas)
  // lastAction = { scope:'compras'|'ventas', type:'delete'|'update'|'bulk_update', items:[...] }
  const [lastAction, setLastAction] = useState(null);

  // Helpers
  const monthKey = (d) => {
    const dt = typeof d === "string" ? new Date(d) : d;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };
  const fmtMonthLabel = (key) => {
    const [y, m] = key.split("-");
    const dt = new Date(Number(y), Number(m) - 1, 1);
    return dt.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  };
  const money = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const monthsBetween = useMemo(() => {
    const out = [];
    if (!startDate || !endDate) return out;
    const s = new Date(startDate);
    const e = new Date(endDate);
    s.setDate(1);
    e.setDate(1);
    while (s <= e) {
      const y = s.getFullYear();
      const m = String(s.getMonth() + 1).padStart(2, "0");
      out.push(`${y}-${m}`);
      s.setMonth(s.getMonth() + 1);
    }
    return out;
  }, [startDate, endDate]);

  // Cargar datos
  useEffect(() => {
    if (!almacenId) {
      setErr("No hay almacén seleccionado.");
      setLoading(false);
      return;
    }
    if (!startDate || !endDate) return;

    const fetchAll = async () => {
      setErr(""); setLoading(true);
      try {
        // Compras (incluye almacen_id, para UNDO)
        const { data: comprasData, error: comprasErr } = await supabase
          .from("Compras")
          .select("id, fecha_compra, total, cantidad, costoUnidad, nombre, formaPago, categoria, proveedor, almacen_id")
          .eq("almacen_id", almacenId)
          .gte("fecha_compra", startDate)
          .lte("fecha_compra", endDate)
          .order("fecha_compra", { ascending: false });
        if (comprasErr) throw comprasErr;

        // Ventas (incluye almacen_id, para UNDO)
        const { data: ventasData, error: ventasErr } = await supabase
          .from("Ventas")
          .select('id, fecha_venta, total, cantidad, "precioVenta", nombre, "formaPago", almacen_id')
          .eq("almacen_id", almacenId)
          .gte("fecha_venta", startDate)
          .lte("fecha_venta", endDate)
          .order("fecha_venta", { ascending: false });
        if (ventasErr) throw ventasErr;

        setCompras(comprasData || []);
        setVentas(ventasData || []);

        // reset controles
        setSelectedCompras(new Set());
        setEditingCompraId(null);
        setSelectedVentas(new Set());
        setEditingVentaId(null);
        setLastAction(null);
      } catch (e) {
        setErr(e.message || "Error al cargar historial.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [almacenId, startDate, endDate]);

  // Agregados por mes
  const { porMes, totalGastos, totalIngresos, maxMesValor } = useMemo(() => {
    const gastos = {}, ingresos = {};
    for (const c of compras) {
      const key = monthKey(c.fecha_compra);
      const tot = (typeof c.total === "number" && Number.isFinite(c.total)) ? c.total : Number(c.cantidad || 0) * Number(c.costoUnidad || 0);
      gastos[key] = (gastos[key] || 0) + Number(tot || 0);
    }
    for (const v of ventas) {
      const key = monthKey(v.fecha_venta);
      const tot = (typeof v.total === "number" && Number.isFinite(v.total)) ? v.total : Number(v.cantidad || 0) * Number(v.precioVenta || 0);
      ingresos[key] = (ingresos[key] || 0) + Number(tot || 0);
    }
    const keys = monthsBetween.length
      ? monthsBetween
      : [...new Set([...Object.keys(gastos), ...Object.keys(ingresos)])].sort();

    const arr = keys.map((k) => ({
      key: k,
      label: fmtMonthLabel(k),
      gastos: gastos[k] || 0,
      ingresos: ingresos[k] || 0,
      neto: (ingresos[k] || 0) - (gastos[k] || 0),
    }));
    const tg = arr.reduce((acc, r) => acc + r.gastos, 0);
    const ti = arr.reduce((acc, r) => acc + r.ingresos, 0);
    const maxVal = Math.max(1, ...arr.map((r) => Math.max(r.ingresos, r.gastos)));
    return { porMes: arr, totalGastos: tg, totalIngresos: ti, maxMesValor: maxVal };
  }, [compras, ventas, monthsBetween]);

  // CSV
  const downloadCSV = (rows, filename) => {
    const header = Object.keys(rows[0] || {}).join(",");
    const body = rows
      .map((r) =>
        Object.values(r)
          .map((v) => {
            if (v === null || v === undefined) return "";
            const s = String(v).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(",")
      )
      .join("\n");
    const csv = header ? `${header}\n${body}` : body;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", filename);
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportResumenCSV = () => {
    const rows = [
      { Mes: "TOTAL", Ingresos: totalIngresos, Gastos: totalGastos, Neto: totalIngresos - totalGastos },
      ...porMes.map((r) => ({ Mes: r.label, Ingresos: r.ingresos, Gastos: r.gastos, Neto: r.neto })),
    ];
    downloadCSV(rows, "resumen_mensual.csv");
  };
  const exportComprasCSV = () => {
    const rows = compras.map((c) => ({
      Fecha: c.fecha_compra, Nombre: c.nombre, Proveedor: c.proveedor || "",
      FormaPago: c.formaPago || "", Cantidad: c.cantidad ?? "",
      CostoUnidad: c.costoUnidad ?? "",
      Total: (typeof c.total === "number" && Number.isFinite(c.total)) ? c.total : (Number(c.cantidad || 0) * Number(c.costoUnidad || 0)),
      Categoria: c.categoria || "",
    }));
    if (rows.length) downloadCSV(rows, "compras.csv");
  };
  const exportVentasCSV = () => {
    const rows = ventas.map((v) => ({
      Fecha: v.fecha_venta, Nombre: v.nombre, FormaPago: v.formaPago || "",
      Cantidad: v.cantidad ?? "", PrecioVenta: v.precioVenta ?? "",
      Total: (typeof v.total === "number" && Number.isFinite(v.total)) ? v.total : (Number(v.cantidad || 0) * Number(v.precioVenta || 0)),
    }));
    if (rows.length) downloadCSV(rows, "ventas.csv");
  };

  // ======== COMPRAS: selección ========
  const allComprasSelected = compras.length > 0 && compras.every((c) => selectedCompras.has(c.id));
  const toggleSelectCompra = (id) => {
    setSelectedCompras((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleSelectAllCompras = () => {
    setSelectedCompras((prev) => {
      const n = new Set(prev);
      if (allComprasSelected) compras.forEach((c) => n.delete(c.id));
      else compras.forEach((c) => n.add(c.id));
      return n;
    });
  };

  // ======== COMPRAS: edición inline ========
  const startEditCompra = (row) => {
    setEditingCompraId(row.id);
    setEditCompraValues({
      nombre: row.nombre ?? "",
      proveedor: row.proveedor ?? "",
      formaPago: row.formaPago ?? "",
      total: row.total === null || row.total === undefined ? "" : String(row.total),
    });
  };
  const cancelEditCompra = () => {
    setEditingCompraId(null);
    setEditCompraValues({ nombre: "", proveedor: "", formaPago: "", total: "" });
  };
  const saveEditCompra = async (id) => {
    setErr("");
    const payload = {
      nombre: (editCompraValues.nombre || "").trim(),
      proveedor: (editCompraValues.proveedor || "").trim() || null,
      formaPago: (editCompraValues.formaPago || "").trim() || null,
    };
    if (editCompraValues.total === "") {
      const row = compras.find((c) => c.id === id);
      const recalc = Number(row?.cantidad || 0) * Number(row?.costoUnidad || 0);
      payload.total = recalc;
    } else {
      const t = Number(editCompraValues.total);
      if (!Number.isFinite(t) || t < 0) { setErr("Total inválido."); return; }
      payload.total = t;
    }
    try {
      const prev = compras.find((c) => c.id === id);
      const { error } = await supabase.from("Compras").update(payload).eq("id", id).eq("almacen_id", almacenId);
      if (error) throw error;
      setCompras((prevList) => prevList.map((r) => (r.id === id ? { ...r, ...payload } : r)));
      setLastAction({ scope: "compras", type: "update", items: [{ id, prev: { nombre: prev?.nombre, proveedor: prev?.proveedor, formaPago: prev?.formaPago, total: prev?.total }, next: { ...payload } }] });
      cancelEditCompra();
    } catch (e) {
      setErr(e.message || "No se pudo actualizar la compra.");
    }
  };

  // ======== COMPRAS: borrado por fila / masivo ========
  const handleDeleteCompraOne = async (row) => {
    if (!window.confirm(`¿Eliminar compra "${row.nombre}"?`)) return;
    try {
      const { error } = await supabase.from("Compras").delete().eq("id", row.id).eq("almacen_id", almacenId);
      if (error) throw error;
      setCompras((prev) => prev.filter((c) => c.id !== row.id));
      setSelectedCompras((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      setLastAction({ scope: "compras", type: "delete", items: [{ row: { ...row } }] });
    } catch (e) {
      setErr(e.message || "No se pudo eliminar la compra.");
    }
  };
  const handleDeleteComprasSelected = async () => {
    const ids = Array.from(selectedCompras);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} compra(s) seleccionadas?`)) return;
    setDeletingCompras(true);
    try {
      const rowsToDelete = compras.filter((c) => selectedCompras.has(c.id));
      const { error } = await supabase.from("Compras").delete().in("id", ids).eq("almacen_id", almacenId);
      if (error) throw error;
      setCompras((prev) => prev.filter((c) => !selectedCompras.has(c.id)));
      setSelectedCompras(new Set());
      setLastAction({ scope: "compras", type: "delete", items: rowsToDelete.map((r) => ({ row: { ...r } })) });
    } catch (e) {
      setErr(e.message || "No se pudieron eliminar las compras seleccionadas.");
    } finally {
      setDeletingCompras(false);
    }
  };

  // ======== COMPRAS: edición masiva ========
  const applyBulkCompras = async () => {
    const ids = Array.from(selectedCompras);
    if (ids.length === 0) { setErr("No hay compras seleccionadas."); return; }
    if (bulkCompraAction === "none") { setErr("Elegí una acción masiva (Compras)."); return; }
    const payload = {};
    if (bulkCompraAction === "formaPago") payload.formaPago = (bulkCompraFormaPago || "").trim() || null;
    if (bulkCompraAction === "proveedor") payload.proveedor = (bulkCompraProveedor || "").trim() || null;
    setApplyingBulkCompras(true);
    try {
      const prevMap = new Map();
      for (const c of compras) if (selectedCompras.has(c.id)) prevMap.set(c.id, { formaPago: c.formaPago, proveedor: c.proveedor });
      const { error } = await supabase.from("Compras").update(payload).in("id", ids).eq("almacen_id", almacenId);
      if (error) throw error;
      setCompras((prev) => prev.map((c) => (selectedCompras.has(c.id) ? { ...c, ...payload } : c)));
      const items = ids.map((id) => ({ id, prev: prevMap.get(id), next: { ...payload } }));
      setLastAction({ scope: "compras", type: "bulk_update", items });
    } catch (e) {
      setErr(e.message || "No se pudo aplicar la edición masiva (Compras).");
    } finally {
      setApplyingBulkCompras(false);
    }
  };

  // ======== VENTAS: selección ========
  const allVentasSelected = ventas.length > 0 && ventas.every((v) => selectedVentas.has(v.id));
  const toggleSelectVenta = (id) => {
    setSelectedVentas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleSelectAllVentas = () => {
    setSelectedVentas((prev) => {
      const n = new Set(prev);
      if (allVentasSelected) ventas.forEach((v) => n.delete(v.id));
      else ventas.forEach((v) => n.add(v.id));
      return n;
    });
  };

  // ======== VENTAS: edición inline ========
  const startEditVenta = (row) => {
    setEditingVentaId(row.id);
    setEditVentaValues({
      nombre: row.nombre ?? "",
      formaPago: row.formaPago ?? "",
      total: row.total === null || row.total === undefined ? "" : String(row.total),
    });
  };
  const cancelEditVenta = () => {
    setEditingVentaId(null);
    setEditVentaValues({ nombre: "", formaPago: "", total: "" });
  };
  const saveEditVenta = async (id) => {
    setErr("");
    const payload = {
      nombre: (editVentaValues.nombre || "").trim(),
      formaPago: (editVentaValues.formaPago || "").trim() || null,
    };
    if (editVentaValues.total === "") {
      const row = ventas.find((v) => v.id === id);
      const recalc = Number(row?.cantidad || 0) * Number(row?.precioVenta || 0);
      payload.total = recalc;
    } else {
      const t = Number(editVentaValues.total);
      if (!Number.isFinite(t) || t < 0) { setErr("Total inválido."); return; }
      payload.total = t;
    }
    try {
      const prev = ventas.find((v) => v.id === id);
      const { error } = await supabase.from("Ventas").update(payload).eq("id", id).eq("almacen_id", almacenId);
      if (error) throw error;
      setVentas((prevList) => prevList.map((r) => (r.id === id ? { ...r, ...payload } : r)));
      setLastAction({ scope: "ventas", type: "update", items: [{ id, prev: { nombre: prev?.nombre, formaPago: prev?.formaPago, total: prev?.total }, next: { ...payload } }] });
      cancelEditVenta();
    } catch (e) {
      setErr(e.message || "No se pudo actualizar la venta.");
    }
  };

  // ======== VENTAS: borrado por fila / masivo ========
  const handleDeleteVentaOne = async (row) => {
    if (!window.confirm(`¿Eliminar venta "${row.nombre}"?`)) return;
    try {
      const { error } = await supabase.from("Ventas").delete().eq("id", row.id).eq("almacen_id", almacenId);
      if (error) throw error;
      setVentas((prev) => prev.filter((v) => v.id !== row.id));
      setSelectedVentas((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      setLastAction({ scope: "ventas", type: "delete", items: [{ row: { ...row } }] });
    } catch (e) {
      setErr(e.message || "No se pudo eliminar la venta.");
    }
  };
  const handleDeleteVentasSelected = async () => {
    const ids = Array.from(selectedVentas);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} venta(s) seleccionadas?`)) return;
    setDeletingVentas(true);
    try {
      const rowsToDelete = ventas.filter((v) => selectedVentas.has(v.id));
      const { error } = await supabase.from("Ventas").delete().in("id", ids).eq("almacen_id", almacenId);
      if (error) throw error;
      setVentas((prev) => prev.filter((v) => !selectedVentas.has(v.id)));
      setSelectedVentas(new Set());
      setLastAction({ scope: "ventas", type: "delete", items: rowsToDelete.map((r) => ({ row: { ...r } })) });
    } catch (e) {
      setErr(e.message || "No se pudieron eliminar las ventas seleccionadas.");
    } finally {
      setDeletingVentas(false);
    }
  };

  // ======== VENTAS: edición masiva (forma de pago) ========
  const applyBulkVentas = async () => {
    const ids = Array.from(selectedVentas);
    if (ids.length === 0) { setErr("No hay ventas seleccionadas."); return; }
    if (bulkVentaAction === "none") { setErr("Elegí una acción masiva (Ventas)."); return; }
    const payload = {};
    if (bulkVentaAction === "formaPago") payload.formaPago = (bulkVentaFormaPago || "").trim() || null;
    setApplyingBulkVentas(true);
    try {
      const prevMap = new Map();
      for (const v of ventas) if (selectedVentas.has(v.id)) prevMap.set(v.id, { formaPago: v.formaPago });
      const { error } = await supabase.from("Ventas").update(payload).in("id", ids).eq("almacen_id", almacenId);
      if (error) throw error;
      setVentas((prev) => prev.map((v) => (selectedVentas.has(v.id) ? { ...v, ...payload } : v)));
      const items = ids.map((id) => ({ id, prev: prevMap.get(id), next: { ...payload } }));
      setLastAction({ scope: "ventas", type: "bulk_update", items });
    } catch (e) {
      setErr(e.message || "No se pudo aplicar la edición masiva (Ventas).");
    } finally {
      setApplyingBulkVentas(false);
    }
  };

  // ======== UNDO (compras o ventas) ========
  const handleUndo = async () => {
    if (!lastAction) return;
    try {
      if (lastAction.scope === "compras") {
        if (lastAction.type === "delete") {
          const rows = lastAction.items.map(({ row }) => ({
            id: row.id, nombre: row.nombre, cantidad: row.cantidad, costoUnidad: row.costoUnidad,
            total: row.total, proveedor: row.proveedor, formaPago: row.formaPago, categoria: row.categoria,
            almacen_id: row.almacen_id, fecha_compra: row.fecha_compra,
          }));
          const { error } = await supabase.from("Compras").insert(rows);
          if (error) throw error;
          setCompras((prev) => {
            const ids = new Set(rows.map((r) => r.id));
            return [...prev.filter((r) => !ids.has(r.id)), ...rows].sort((a, b) => Number(b.id) - Number(a.id));
          });
        } else {
          for (const it of lastAction.items) {
            const id = it.id; const prevVals = it.prev || {};
            const payload = {};
            if ("nombre" in prevVals) payload.nombre = prevVals.nombre ?? null;
            if ("proveedor" in prevVals) payload.proveedor = prevVals.proveedor ?? null;
            if ("formaPago" in prevVals) payload.formaPago = prevVals.formaPago ?? null;
            if ("total" in prevVals) payload.total = prevVals.total ?? null;
            const { error } = await supabase.from("Compras").update(payload).eq("id", id).eq("almacen_id", almacenId);
            if (error) throw error;
          }
          setCompras((prev) => prev.map((r) => {
            const it = lastAction.items.find((x) => x.id === r.id);
            return it ? { ...r, ...it.prev } : r;
          }));
        }
      } else if (lastAction.scope === "ventas") {
        if (lastAction.type === "delete") {
          const rows = lastAction.items.map(({ row }) => ({
            id: row.id, nombre: row.nombre, cantidad: row.cantidad, precioVenta: row.precioVenta,
            total: row.total, formaPago: row.formaPago,
            almacen_id: row.almacen_id, fecha_venta: row.fecha_venta,
          }));
          const { error } = await supabase.from("Ventas").insert(rows);
          if (error) throw error;
          setVentas((prev) => {
            const ids = new Set(rows.map((r) => r.id));
            return [...prev.filter((r) => !ids.has(r.id)), ...rows].sort((a, b) => Number(b.id) - Number(a.id));
          });
        } else {
          for (const it of lastAction.items) {
            const id = it.id; const prevVals = it.prev || {};
            const payload = {};
            if ("nombre" in prevVals) payload.nombre = prevVals.nombre ?? null;
            if ("formaPago" in prevVals) payload.formaPago = prevVals.formaPago ?? null;
            if ("total" in prevVals) payload.total = prevVals.total ?? null;
            const { error } = await supabase.from("Ventas").update(payload).eq("id", id).eq("almacen_id", almacenId);
            if (error) throw error;
          }
          setVentas((prev) => prev.map((r) => {
            const it = lastAction.items.find((x) => x.id === r.id);
            return it ? { ...r, ...it.prev } : r;
          }));
        }
      }
      setLastAction(null);
    } catch (e) {
      setErr(e.message || "No se pudo deshacer la última acción.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 text-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Historial</h1>
        <button onClick={() => navigate("/")} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">
          Volver al menú
        </button>
      </div>

      {/* Filtros + Quick selector + Tabs */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div>
              <label className="block text-sm text-gray-800 mb-1">Desde</label>
              <input type="date" value={startDate} onChange={(e) => onChangeStart(e.target.value)} className="border rounded-xl px-3 py-2 bg-gray-50" max={endDate} />
            </div>
            <div>
              <label className="block text-sm text-gray-800 mb-1">Hasta</label>
              <input type="date" value={endDate} onChange={(e) => onChangeEnd(e.target.value)} className="border rounded-xl px-3 py-2 bg-gray-50" min={startDate} max={todayStr} />
            </div>
            <div className="flex items-center flex-wrap gap-2 md:ml-auto">
              {[
                { key: "mes_actual", label: "Este mes" },
                { key: "ult3", label: "Últimos 3" },
                { key: "ult6", label: "Últimos 6" },
                { key: "ult12", label: "Últimos 12" },
                { key: "anio_actual", label: "Año actual" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => applyQuickRange(key)}
                  className={
                    "px-3 py-1.5 rounded-xl text-sm border transition " +
                    (quickKey === key ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 hover:bg-gray-100 text-gray-900 border-gray-200")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {[
              { key: "resumen", label: "Resumen" },
              { key: "compras", label: "Compras" },
              { key: "ventas", label: "Ventas" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  "px-3 py-2 rounded-xl text-sm border " +
                  (tab === t.key ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-gray-50 hover:bg-gray-100 text-gray-900 border-gray-200")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Estados */}
      {err && <div className="mb-4 text-sm text-red-800 bg-red-100 px-3 py-2 rounded-lg">{err}</div>}
      {loading && <div>Cargando…</div>}

      {!loading && !err && (
        <>
          {/* RESUMEN */}
          {tab === "resumen" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="rounded-2xl bg-blue-50 p-4"><p className="text-sm text-gray-900">Ingresos (periodo)</p><p className="text-2xl font-bold">${money(totalIngresos)}</p></div>
                <div className="rounded-2xl bg-red-50 p-4"><p className="text-sm text-gray-900">Gastos (periodo)</p><p className="text-2xl font-bold">${money(totalGastos)}</p></div>
                <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm text-gray-900">Neto (periodo)</p><p className="text-2xl font-bold">${money(totalIngresos - totalGastos)}</p></div>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <button onClick={exportResumenCSV} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">Descargar CSV (resumen mensual)</button>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verGrafico} onChange={(e) => setVerGrafico(e.target.checked)} />Ver gráfico</label>
              </div>
              {verGrafico && (
                <div className="bg-white rounded-2xl shadow p-4 mb-4">
                  <h2 className="text-lg font-semibold mb-3">Gráfico por mes</h2>
                  <div className="space-y-3">
                    {porMes.map((r) => (
                      <div key={r.key}>
                        <div className="flex justify-between text-sm mb-1"><span className="text-gray-900">{r.label}</span><span className="text-gray-900">Ingresos: ${money(r.ingresos)} · Gastos: ${money(r.gastos)}</span></div>
                        <div className="w-full">
                          <div className="h-2 rounded bg-blue-200 mb-1"><div className="h-2 rounded bg-blue-600" style={{ width: `${(r.ingresos / maxMesValor) * 100}%` }} /></div>
                          <div className="h-2 rounded bg-red-200"><div className="h-2 rounded bg-red-600" style={{ width: `${(r.gastos / maxMesValor) * 100}%` }} /></div>
                        </div>
                      </div>
                    ))}
                    {porMes.length === 0 && <div className="text-gray-900">No hay datos en el periodo.</div>}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-2xl shadow p-4 mb-8 overflow-x-auto">
                <h2 className="text-lg font-semibold mb-3">Resumen por mes</h2>
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left"><th className="py-2 pr-4 text-gray-900">Mes</th><th className="py-2 pr-4 text-gray-900">Ingresos</th><th className="py-2 pr-4 text-gray-900">Gastos</th><th className="py-2 pr-4 text-gray-900">Neto</th></tr></thead>
                  <tbody>
                    {porMes.map((r) => (<tr key={r.key} className="border-t"><td className="py-2 pr-4">{r.label}</td><td className="py-2 pr-4">${money(r.ingresos)}</td><td className="py-2 pr-4">${money(r.gastos)}</td><td className="py-2 pr-4 font-medium">${money(r.neto)}</td></tr>))}
                    {porMes.length === 0 && (<tr><td colSpan={4} className="py-4 text-gray-900">No hay movimientos en el periodo.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* COMPRAS (ya con selección/editar/masivo/undo) */}
          {tab === "compras" && (
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="text-lg font-semibold">Compras</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleUndo} disabled={!lastAction} className={"inline-flex items-center gap-2 px-3 py-2 rounded-lg transition " + (!lastAction ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300")} title="Deshacer"><FaUndo />Deshacer</button>
                  <button onClick={handleDeleteComprasSelected} disabled={selectedCompras.size === 0 || deletingCompras} className={"inline-flex items-center gap-2 px-3 py-2 rounded-lg transition " + (selectedCompras.size === 0 || deletingCompras ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 text-white")}><FaTrash />Eliminar seleccionados</button>
                  <button onClick={exportComprasCSV} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">Descargar CSV</button>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-900">Acción masiva (Compras):</span>
                  <select value={bulkCompraAction} onChange={(e) => setBulkCompraAction(e.target.value)} className="px-3 py-2 border rounded-lg">
                    <option value="none">Elegir…</option>
                    <option value="formaPago">Cambiar forma de pago</option>
                    <option value="proveedor">Cambiar proveedor</option>
                  </select>
                  {bulkCompraAction === "formaPago" && (<input type="text" placeholder="Nueva forma de pago" value={bulkCompraFormaPago} onChange={(e) => setBulkCompraFormaPago(e.target.value)} className="px-3 py-2 border rounded-lg" />)}
                  {bulkCompraAction === "proveedor" && (<input type="text" placeholder="Nuevo proveedor" value={bulkCompraProveedor} onChange={(e) => setBulkCompraProveedor(e.target.value)} className="px-3 py-2 border rounded-lg" />)}
                  <button onClick={applyBulkCompras} disabled={selectedCompras.size === 0 || applyingBulkCompras || bulkCompraAction === "none"} className={"px-3 py-2 rounded-lg transition " + (selectedCompras.size === 0 || applyingBulkCompras || bulkCompraAction === "none" ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white")}>{applyingBulkCompras ? "Aplicando…" : "Aplicar"}</button>
                  <span className="text-sm text-gray-700 ml-auto">Seleccionadas: {selectedCompras.size}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="py-2 pr-3 text-center"><input type="checkbox" checked={allComprasSelected} onChange={toggleSelectAllCompras} aria-label="Seleccionar todas" /></th>
                      <th className="py-2 pr-4 text-gray-900">Fecha</th>
                      <th className="py-2 pr-4 text-gray-900">Nombre</th>
                      <th className="py-2 pr-4 text-gray-900">Proveedor</th>
                      <th className="py-2 pr-4 text-gray-900">Forma de pago</th>
                      <th className="py-2 pr-4 text-gray-900">Total</th>
                      <th className="py-2 pr-4 text-center text-gray-900">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compras.slice(0, 500).map((c) => {
                      const isEditing = editingCompraId === c.id;
                      const tot = (typeof c.total === "number" && Number.isFinite(c.total)) ? c.total : Number(c.cantidad || 0) * Number(c.costoUnidad || 0);
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="py-2 pr-3 text-center align-middle"><input type="checkbox" checked={selectedCompras.has(c.id)} onChange={() => toggleSelectCompra(c.id)} /></td>
                          <td className="py-2 pr-4">{new Date(c.fecha_compra).toLocaleDateString()}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="text" value={editCompraValues.nombre} onChange={(e) => setEditCompraValues((v) => ({ ...v, nombre: e.target.value }))} className="border rounded-lg px-2 py-1 w-full" />) : c.nombre}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="text" value={editCompraValues.proveedor} onChange={(e) => setEditCompraValues((v) => ({ ...v, proveedor: e.target.value }))} className="border rounded-lg px-2 py-1 w/full" />) : (c.proveedor || "-")}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="text" value={editCompraValues.formaPago} onChange={(e) => setEditCompraValues((v) => ({ ...v, formaPago: e.target.value }))} className="border rounded-lg px-2 py-1 w-full" />) : (c.formaPago || "-")}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="number" min="0" value={editCompraValues.total} onChange={(e) => setEditCompraValues((v) => ({ ...v, total: e.target.value }))} className="border rounded-lg px-2 py-1 w-32" />) : (`$${money(tot)}`)}</td>
                          <td className="py-2 pr-4 text-center">
                            {!isEditing ? (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => startEditCompra(c)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-900"><FaEdit />Editar</button>
                                <button onClick={() => handleDeleteCompraOne(c)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"><FaTrash />Borrar</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => saveEditCompra(c.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">Guardar</button>
                                <button onClick={cancelEditCompra} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900">Cancelar</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {compras.length === 0 && (<tr><td colSpan={7} className="py-4 text-gray-900">Sin compras en el periodo.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VENTAS (ahora con selección/editar/masivo/undo) */}
          {tab === "ventas" && (
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="text-lg font-semibold">Ventas</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleUndo} disabled={!lastAction} className={"inline-flex items-center gap-2 px-3 py-2 rounded-lg transition " + (!lastAction ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300")} title="Deshacer"><FaUndo />Deshacer</button>
                  <button onClick={handleDeleteVentasSelected} disabled={selectedVentas.size === 0 || deletingVentas} className={"inline-flex items-center gap-2 px-3 py-2 rounded-lg transition " + (selectedVentas.size === 0 || deletingVentas ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 text-white")}><FaTrash />Eliminar seleccionadas</button>
                  <button onClick={exportVentasCSV} className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">Descargar CSV</button>
                </div>
              </div>

              {/* Edición masiva ventas */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-900">Acción masiva (Ventas):</span>
                  <select value={bulkVentaAction} onChange={(e) => setBulkVentaAction(e.target.value)} className="px-3 py-2 border rounded-lg">
                    <option value="none">Elegir…</option>
                    <option value="formaPago">Cambiar forma de pago</option>
                  </select>
                  {bulkVentaAction === "formaPago" && (
                    <input type="text" placeholder="Nueva forma de pago" value={bulkVentaFormaPago} onChange={(e) => setBulkVentaFormaPago(e.target.value)} className="px-3 py-2 border rounded-lg" />
                  )}
                  <button onClick={applyBulkVentas} disabled={selectedVentas.size === 0 || applyingBulkVentas || bulkVentaAction === "none"} className={"px-3 py-2 rounded-lg transition " + (selectedVentas.size === 0 || applyingBulkVentas || bulkVentaAction === "none" ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white")}>{applyingBulkVentas ? "Aplicando…" : "Aplicar"}</button>
                  <span className="text-sm text-gray-700 ml-auto">Seleccionadas: {selectedVentas.size}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="py-2 pr-3 text-center"><input type="checkbox" checked={allVentasSelected} onChange={toggleSelectAllVentas} aria-label="Seleccionar todas" /></th>
                      <th className="py-2 pr-4 text-gray-900">Fecha</th>
                      <th className="py-2 pr-4 text-gray-900">Nombre</th>
                      <th className="py-2 pr-4 text-gray-900">Forma de pago</th>
                      <th className="py-2 pr-4 text-gray-900">Total</th>
                      <th className="py-2 pr-4 text-center text-gray-900">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.slice(0, 500).map((v) => {
                      const isEditing = editingVentaId === v.id;
                      const tot = (typeof v.total === "number" && Number.isFinite(v.total)) ? v.total : Number(v.cantidad || 0) * Number(v.precioVenta || 0);
                      return (
                        <tr key={v.id} className="border-t">
                          <td className="py-2 pr-3 text-center align-middle"><input type="checkbox" checked={selectedVentas.has(v.id)} onChange={() => toggleSelectVenta(v.id)} /></td>
                          <td className="py-2 pr-4">{new Date(v.fecha_venta).toLocaleDateString()}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="text" value={editVentaValues.nombre} onChange={(e) => setEditVentaValues((vv) => ({ ...vv, nombre: e.target.value }))} className="border rounded-lg px-2 py-1 w-full" />) : v.nombre}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="text" value={editVentaValues.formaPago} onChange={(e) => setEditVentaValues((vv) => ({ ...vv, formaPago: e.target.value }))} className="border rounded-lg px-2 py-1 w-full" />) : (v.formaPago || "-")}</td>
                          <td className="py-2 pr-4">{isEditing ? (<input type="number" min="0" value={editVentaValues.total} onChange={(e) => setEditVentaValues((vv) => ({ ...vv, total: e.target.value }))} className="border rounded-lg px-2 py-1 w-32" />) : (`$${money(tot)}`)}</td>
                          <td className="py-2 pr-4 text-center">
                            {!isEditing ? (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => startEditVenta(v)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-900"><FaEdit />Editar</button>
                                <button onClick={() => handleDeleteVentaOne(v)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"><FaTrash />Borrar</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => saveEditVenta(v.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">Guardar</button>
                                <button onClick={cancelEditVenta} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900">Cancelar</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {ventas.length === 0 && (<tr><td colSpan={6} className="py-4 text-gray-900">Sin ventas en el periodo.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
