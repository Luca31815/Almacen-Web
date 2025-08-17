// Historial.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

export default function Historial({ almacenId: propAlmacenId }) {
  const navigate = useNavigate();
  const almacenId = propAlmacenId || localStorage.getItem("almacen_id");

  // Tabs
  const [tab, setTab] = useState("resumen");

  // Fechas base
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
    if (key === "mes_actual") {
      s = startOfMonth(now);
    } else if (key === "ult3") {
      s = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    } else if (key === "ult6") {
      s = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    } else if (key === "ult12") {
      s = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1));
    } else if (key === "anio_actual") {
      s = new Date(now.getFullYear(), 0, 1);
    }
    setStartDate(fmt(s));
    setEndDate(fmt(now));
    setQuickKey(key);
  };
  const onChangeStart = (val) => {
    setStartDate(val);
    setQuickKey(null);
  };
  const onChangeEnd = (val) => {
    setEndDate(val);
    setQuickKey(null);
  };

  // Datos
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [verGrafico, setVerGrafico] = useState(true);

  // Orden por columnas (separado por pestaña)
  const [sortCompras, setSortCompras] = useState({ key: null, dir: "asc" });
  const [sortVentas, setSortVentas] = useState({ key: null, dir: "asc" });

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
    (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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

  // Carga
  useEffect(() => {
    if (!almacenId) {
      setErr("No hay almacén seleccionado.");
      setLoading(false);
      return;
    }
    if (!startDate || !endDate) return;

    const fetchAll = async () => {
      setErr("");
      setLoading(true);
      try {
        const { data: comprasData, error: comprasErr } = await supabase
          .from("Compras")
          .select("id, fecha_compra, total, cantidad, costoUnidad, nombre, formaPago, categoria, proveedor")
          .eq("almacen_id", almacenId)
          .gte("fecha_compra", startDate)
          .lte("fecha_compra", endDate)
          .order("fecha_compra", { ascending: false });
        if (comprasErr) throw comprasErr;

        const { data: ventasData, error: ventasErr } = await supabase
          .from("Ventas")
          .select('id, fecha_venta, total, cantidad, "precioVenta", nombre, "formaPago"')
          .eq("almacen_id", almacenId)
          .gte("fecha_venta", startDate)
          .lte("fecha_venta", endDate)
          .order("fecha_venta", { ascending: false });
        if (ventasErr) throw ventasErr;

        setCompras(comprasData || []);
        setVentas(ventasData || []);
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
    const gastos = {};
    const ingresos = {};

    for (const c of compras) {
      const key = monthKey(c.fecha_compra);
      const tot =
        typeof c.total === "number" && Number.isFinite(c.total)
          ? c.total
          : Number(c.cantidad || 0) * Number(c.costoUnidad || 0);
      gastos[key] = (gastos[key] || 0) + Number(tot || 0);
    }

    for (const v of ventas) {
      const key = monthKey(v.fecha_venta);
      const tot =
        typeof v.total === "number" && Number.isFinite(v.total)
          ? v.total
          : Number(v.cantidad || 0) * Number(v.precioVenta || 0);
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

  // Export CSV helpers
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
      ...porMes.map((r) => ({
        Mes: r.label,
        Ingresos: r.ingresos,
        Gastos: r.gastos,
        Neto: r.neto,
      })),
    ];
    downloadCSV(rows, "resumen_mensual.csv");
  };

  const exportComprasCSV = () => {
    const rows = compras.map((c) => ({
      Fecha: c.fecha_compra,
      Nombre: c.nombre,
      Proveedor: c.proveedor || "",
      FormaPago: c.formaPago || "",
      Cantidad: c.cantidad ?? "",
      CostoUnidad: c.costoUnidad ?? "",
      Total:
        typeof c.total === "number" && Number.isFinite(c.total)
          ? c.total
          : Number(c.cantidad || 0) * Number(c.costoUnidad || 0),
      Categoria: c.categoria || "",
    }));
    if (rows.length) downloadCSV(rows, "compras.csv");
  };

  const exportVentasCSV = () => {
    const rows = ventas.map((v) => ({
      Fecha: v.fecha_venta,
      Nombre: v.nombre,
      FormaPago: v.formaPago || "",
      Cantidad: v.cantidad ?? "",
      PrecioVenta: v.precioVenta ?? "",
      Total:
        typeof v.total === "number" && Number.isFinite(v.total)
          ? v.total
          : Number(v.cantidad || 0) * Number(v.precioVenta || 0),
    }));
    if (rows.length) downloadCSV(rows, "ventas.csv");
  };

  // ------- Orden por columnas (Compras/Ventas) -------
  const handleSortToggle = (state, setState, key) => {
    setState((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const cmpVal = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

  const sortComprasFn = useMemo(() => {
    const key = sortCompras.key;
    const dir = sortCompras.dir;
    if (!key) return null;

    return (a, b) => {
      let r = 0;
      if (key === "fecha_compra") {
        // YYYY-MM-DD (string compare sirve)
        const av = a.fecha_compra ?? "";
        const bv = b.fecha_compra ?? "";
        r = cmpVal(av, bv);
      } else if (key === "nombre") {
        r = cmpVal(String(a.nombre ?? "").toLowerCase(), String(b.nombre ?? "").toLowerCase());
      } else if (key === "proveedor") {
        r = cmpVal(String(a.proveedor ?? "").toLowerCase(), String(b.proveedor ?? "").toLowerCase());
      } else if (key === "formaPago") {
        r = cmpVal(String(a.formaPago ?? "").toLowerCase(), String(b.formaPago ?? "").toLowerCase());
      } else if (key === "total_calc") {
        const ta =
          typeof a.total === "number" && Number.isFinite(a.total)
            ? a.total
            : Number(a.cantidad || 0) * Number(a.costoUnidad || 0);
        const tb =
          typeof b.total === "number" && Number.isFinite(b.total)
            ? b.total
            : Number(b.cantidad || 0) * Number(b.costoUnidad || 0);
        r = cmpVal(Number(ta || 0), Number(tb || 0));
      }
      return dir === "asc" ? r : -r;
    };
  }, [sortCompras]);

  const sortVentasFn = useMemo(() => {
    const key = sortVentas.key;
    const dir = sortVentas.dir;
    if (!key) return null;

    return (a, b) => {
      let r = 0;
      if (key === "fecha_venta") {
        const av = a.fecha_venta ?? "";
        const bv = b.fecha_venta ?? "";
        r = cmpVal(av, bv);
      } else if (key === "nombre") {
        r = cmpVal(String(a.nombre ?? "").toLowerCase(), String(b.nombre ?? "").toLowerCase());
      } else if (key === "formaPago") {
        r = cmpVal(String(a.formaPago ?? "").toLowerCase(), String(b.formaPago ?? "").toLowerCase());
      } else if (key === "total_calc") {
        const ta =
          typeof a.total === "number" && Number.isFinite(a.total)
            ? a.total
            : Number(a.cantidad || 0) * Number(a.precioVenta || 0);
        const tb =
          typeof b.total === "number" && Number.isFinite(b.total)
            ? b.total
            : Number(b.cantidad || 0) * Number(b.precioVenta || 0);
        r = cmpVal(Number(ta || 0), Number(tb || 0));
      }
      return dir === "asc" ? r : -r;
    };
  }, [sortVentas]);

  const sortHeader = (state, setState, key, label) => {
    const is = state.key === key;
    return (
      <button
        onClick={() => handleSortToggle(state, setState, key)}
        className="inline-flex items-center gap-1 select-none hover:text-blue-700"
        title={"Ordenar por " + label}
      >
        <span>{label}</span>
        <span className="text-xs opacity-70">{is ? (state.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    );
  };

  // ---------- UI ----------
  return (
    <div className="max-w-6xl md:max-w-7xl mx-auto p-6 text-gray-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Historial</h1>
        <button
          onClick={() => navigate("/")}
          className="px-2.5 py-2 sm:px-3 rounded-xl bg-gray-100 hover:bg-gray-200 whitespace-nowrap text-sm"
        >
          Volver al menú
        </button>
      </div>

      {/* Filtros + Quick selector + Tabs */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <div className="flex flex-col gap-3">
          {/* Fechas */}
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div>
              <label className="block text-sm text-gray-800 mb-1">Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onChangeStart(e.target.value)}
                className="border rounded-xl px-3 py-2 bg-white text-gray-900 border-gray-300"
                max={endDate}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-800 mb-1">Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onChangeEnd(e.target.value)}
                className="border rounded-xl px-3 py-2 bg-white text-gray-900 border-gray-300"
                min={startDate}
                max={todayStr}
              />
            </div>

            {/* Quick range */}
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
                    "px-2.5 py-2 sm:px-3 rounded-xl text-sm border transition whitespace-nowrap " +
                    (quickKey === key
                      ? "bg-blue-100 text-blue-800 border-blue-300"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-900 border-gray-200")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs (mini menú) */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {[
              { key: "resumen", label: "Resumen" },
              { key: "compras", label: "Compras" },
              { key: "ventas", label: "Ventas" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  "px-2.5 py-2 sm:px-3 rounded-xl text-sm border whitespace-nowrap " +
                  (tab === t.key
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-gray-50 hover:bg-gray-100 text-gray-900 border-gray-200")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Estados */}
      {err && (
        <div className="mb-4 text-sm text-red-800 bg-red-100 px-3 py-2 rounded-lg">
          {err}
        </div>
      )}
      {loading && <div>Cargando…</div>}

      {/* Contenido */}
      {!loading && !err && (
        <>
          {/* TAB: RESUMEN */}
          {tab === "resumen" && (
            <>
              {/* Resumen general */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="rounded-2xl bg-blue-50 p-4">
                  <p className="text-sm text-gray-900">Ingresos (periodo)</p>
                  <p className="text-2xl font-bold">${money(totalIngresos)}</p>
                </div>
                <div className="rounded-2xl bg-red-50 p-4">
                  <p className="text-sm text-gray-900">Gastos (periodo)</p>
                  <p className="text-2xl font-bold">${money(totalGastos)}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <p className="text-sm text-gray-900">Neto (periodo)</p>
                  <p className="text-2xl font-bold">
                    ${money(totalIngresos - totalGastos)}
                  </p>
                </div>
              </div>

              {/* Controles extra */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <button
                  onClick={exportResumenCSV}
                  className="px-2.5 py-2 sm:px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm whitespace-nowrap"
                >
                  Descargar CSV (resumen mensual)
                </button>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={verGrafico}
                    onChange={(e) => setVerGrafico(e.target.checked)}
                  />
                  Ver gráfico
                </label>
              </div>

              {/* Gráfico simple */}
              {verGrafico && (
                <div className="bg-white rounded-2xl shadow p-4 mb-4">
                  <h2 className="text-lg font-semibold mb-3">Gráfico por mes</h2>
                  <div className="space-y-3">
                    {porMes.map((r) => (
                      <div key={r.key}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-900">{r.label}</span>
                          <span className="text-gray-900">
                            Ingresos: ${money(r.ingresos)} · Gastos: ${money(r.gastos)}
                          </span>
                        </div>
                        <div className="w-full">
                          <div className="h-2 rounded bg-blue-200 mb-1">
                            <div
                              className="h-2 rounded bg-blue-600"
                              style={{ width: `${(r.ingresos / maxMesValor) * 100}%` }}
                            />
                          </div>
                          <div className="h-2 rounded bg-red-200">
                            <div
                              className="h-2 rounded bg-red-600"
                              style={{ width: `${(r.gastos / maxMesValor) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {porMes.length === 0 && (
                      <div className="text-gray-900">No hay datos en el periodo.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Tabla mensual */}
              <div className="bg-white rounded-2xl shadow p-4 mb-8 overflow-x-auto">
                <h2 className="text-lg font-semibold mb-3">Resumen por mes</h2>
                <table className="min-w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="py-2 pr-4 text-gray-900">Mes</th>
                      <th className="py-2 pr-4 text-gray-900">Ingresos</th>
                      <th className="py-2 pr-4 text-gray-900">Gastos</th>
                      <th className="py-2 pr-4 text-gray-900">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porMes.map((r) => (
                      <tr key={r.key} className="border-t">
                        <td className="py-2 pr-4">{r.label}</td>
                        <td className="py-2 pr-4">${money(r.ingresos)}</td>
                        <td className="py-2 pr-4">${money(r.gastos)}</td>
                        <td className="py-2 pr-4 font-medium">${money(r.neto)}</td>
                      </tr>
                    ))}
                    {porMes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-gray-900">
                          No hay movimientos en el periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* TAB: COMPRAS */}
          {tab === "compras" && (
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-lg font-semibold">Compras</h2>
                <button
                  onClick={exportComprasCSV}
                  className="px-2.5 py-2 sm:px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm whitespace-nowrap"
                >
                  Descargar CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortCompras, setSortCompras, "fecha_compra", "Fecha")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortCompras, setSortCompras, "nombre", "Nombre")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortCompras, setSortCompras, "proveedor", "Proveedor")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortCompras, setSortCompras, "formaPago", "Forma de pago")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortCompras, setSortCompras, "total_calc", "Total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sortComprasFn ? [...compras].sort(sortComprasFn) : compras)
                      .slice(0, 500)
                      .map((c) => {
                        const tot =
                          typeof c.total === "number" && Number.isFinite(c.total)
                            ? c.total
                            : Number(c.cantidad || 0) * Number(c.costoUnidad || 0);
                        return (
                          <tr key={c.id} className="border-t">
                            <td className="py-2 pr-4">
                              {new Date(c.fecha_compra).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-4">{c.nombre}</td>
                            <td className="py-2 pr-4">{c.proveedor || "-"}</td>
                            <td className="py-2 pr-4">{c.formaPago || "-"}</td>
                            <td className="py-2 pr-4">${money(tot)}</td>
                          </tr>
                        );
                      })}
                    {compras.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-gray-900">
                          Sin compras en el periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: VENTAS */}
          {tab === "ventas" && (
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-lg font-semibold">Ventas</h2>
                <button
                  onClick={exportVentasCSV}
                  className="px-2.5 py-2 sm:px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm whitespace-nowrap"
                >
                  Descargar CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortVentas, setSortVentas, "fecha_venta", "Fecha")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortVentas, setSortVentas, "nombre", "Nombre")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortVentas, setSortVentas, "formaPago", "Forma de pago")}
                      </th>
                      <th className="py-2 pr-4 text-gray-900 cursor-pointer">
                        {sortHeader(sortVentas, setSortVentas, "total_calc", "Total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sortVentasFn ? [...ventas].sort(sortVentasFn) : ventas)
                      .slice(0, 500)
                      .map((v) => {
                        const tot =
                          typeof v.total === "number" && Number.isFinite(v.total)
                            ? v.total
                            : Number(v.cantidad || 0) * Number(v.precioVenta || 0);
                        return (
                          <tr key={v.id} className="border-t">
                            <td className="py-2 pr-4">
                              {new Date(v.fecha_venta).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-4">{v.nombre}</td>
                            <td className="py-2 pr-4">{v.formaPago || "-"}</td>
                            <td className="py-2 pr-4">${money(tot)}</td>
                          </tr>
                        );
                      })}
                    {ventas.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-gray-900">
                          Sin ventas en el periodo.
                        </td>
                      </tr>
                    )}
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
