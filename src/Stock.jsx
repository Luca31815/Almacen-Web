// Stock.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Link, useNavigate } from "react-router-dom";
import { FaEdit, FaTrash, FaUndo, FaChevronRight, FaChevronDown } from "react-icons/fa";

export default function Stock() {
  const [productos, setProductos] = useState([]); // {id,nombre,cantidad,categoria, proxima_vencimiento, almacen_id}
  const [categorias, setCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [soloConVencimiento, setSoloConVencimiento] = useState(false);
  const [ordenarPorVencimiento, setOrdenarPorVencimiento] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Selección / edición inline
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ nombre: "", cantidad: "", categoria: "" });

  // Edición masiva
  const [bulkAction, setBulkAction] = useState("none");
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [bulkCantidad, setBulkCantidad] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // UNDO
  // lastAction = {
  //   type:'delete'|'update'|'bulk_update',
  //   items:[{id, prev, next}],
  //   lotes?: [{ stockId, changes:[{ id, prev:{fecha,cantidad}, next:{fecha,cantidad} }] }]
  // }
  const [lastAction, setLastAction] = useState(null);

  // Lotes por producto + expansión
  const [lotesMap, setLotesMap] = useState({}); // { [stock_id]: [{id, stock_id, cantidad, fecha_vencimiento}] }
  const [expanded, setExpanded] = useState(new Set());

  // Edición por lote
  const [editedLoteDates, setEditedLoteDates] = useState({}); // { [lote_id]: 'YYYY-MM-DD'|'' }
  const [editedLoteQty, setEditedLoteQty] = useState({});     // { [lote_id]: '123' }
  const [editLotesSnapshot, setEditLotesSnapshot] = useState({}); // { [stock_id]: [{id, fecha_vencimiento, cantidad}] }

  // Orden por encabezado
  const [sort, setSort] = useState({ key: null, dir: "asc" }); // key: 'nombre'|'cantidad'|'categoria'|'proxima_vencimiento'

  // Mensajes
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const navigate = useNavigate();
  const almacen_id = localStorage.getItem("almacen_id");

  useEffect(() => {
    if (!almacen_id) {
      navigate("/almacenes");
      return;
    }

    const fetchStock = async () => {
      setErr(""); setMsg("");
      const { data: stock, error } = await supabase
        .from("Stock")
        .select("id, nombre, cantidad, categoria, almacen_id")
        .eq("almacen_id", almacen_id);

      if (error) {
        setErr(error.message || "Error al cargar stock.");
        return;
      }
      if (!stock || stock.length === 0) {
        setProductos([]); setCategorias([]); setLotesMap({});
        return;
      }

      const stockIds = stock.map((s) => s.id);
      const { data: lotes } = await supabase
        .from("Lotes")
        .select("id, stock_id, fecha_vencimiento, cantidad")
        .in("stock_id", stockIds)
        .gt("cantidad", 0)
        .order("fecha_vencimiento", { ascending: true });

      const map = {};
      if (lotes) {
        for (const l of lotes) {
          if (!map[l.stock_id]) map[l.stock_id] = [];
          map[l.stock_id].push(l);
        }
      }
      setLotesMap(map);

      const proxima = (sid) => {
        const ls = (map[sid] || []).filter(x => Number(x.cantidad) > 0);
        let min = null;
        for (const l of ls) {
          if (!l.fecha_vencimiento) continue;
          if (min === null || l.fecha_vencimiento < min) min = l.fecha_vencimiento;
        }
        return min;
      };

      const enriquecidos = stock.map((s) => ({
        ...s,
        proxima_vencimiento: proxima(s.id) || null,
      }));
      setProductos(enriquecidos);

      const categoriasUnicas = [...new Set(enriquecidos.map((p) => p.categoria).filter(Boolean))];
      setCategorias(categoriasUnicas);

      setSelectedIds(new Set());
      setExpanded(new Set());
      setLastAction(null);
    };

    fetchStock();
  }, [almacen_id, navigate]);

  // Helpers lotes
  const distinctDatesCount = (sid) => {
    const ls = (lotesMap[sid] || []).filter(x => Number(x.cantidad) > 0);
    const set = new Set(ls.map((l) => l.fecha_vencimiento).filter(Boolean));
    return set.size;
  };
  const hasDesglose = (sid) => distinctDatesCount(sid) > 1;

  const aggregateLotes = (sid) => {
    const ls = (lotesMap[sid] || []).filter(x => Number(x.cantidad) > 0);
    const agg = new Map();
    for (const l of ls) {
      const k = l.fecha_vencimiento || "SIN_FECHA";
      agg.set(k, (agg.get(k) || 0) + Number(l.cantidad || 0));
    }
    const rows = Array.from(agg.entries()).map(([fecha, cantidad]) => ({
      fecha: fecha === "SIN_FECHA" ? null : fecha,
      cantidad,
    }));
    return rows.sort((a, b) => {
      if (a.fecha && b.fecha) return a.fecha.localeCompare(b.fecha);
      if (a.fecha && !b.fecha) return -1;
      if (!a.fecha && b.fecha) return 1;
      return 0;
    });
  };
  const sumEditedQty = (ls) =>
    ls.reduce((acc, l) => acc + Number(editedLoteQty[l.id] ?? l.cantidad ?? 0), 0);

  // Ordenador por encabezado
  const handleSort = (key) => {
    setOrdenarPorVencimiento(false); // prioridad al header
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };
  const cmp = (a, b, key) => {
    const av = a?.[key];
    const bv = b?.[key];

    if (key === "cantidad") {
      const an = Number(av ?? 0);
      const bn = Number(bv ?? 0);
      return an === bn ? 0 : an < bn ? -1 : 1;
    }
    if (key === "proxima_vencimiento") {
      // nulls al final en asc, al principio en desc
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      // YYYY-MM-DD lexicográfico sirve
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
    // strings
    const as = String(av ?? "").toLowerCase();
    const bs = String(bv ?? "").toLowerCase();
    return as === bs ? 0 : as < bs ? -1 : 1;
  };

  // Filtros / orden
  const productosFiltrados = useMemo(() => {
    let list = categoriaSeleccionada
      ? productos.filter((p) => p.categoria === categoriaSeleccionada)
      : productos;

    if (soloConVencimiento) list = list.filter((p) => p.proxima_vencimiento !== null);

    // Orden por encabezado, si está activo
    if (sort.key) {
      list = [...list].sort((a, b) => {
        const r = cmp(a, b, sort.key);
        return sort.dir === "asc" ? r : -r;
      });
    } else if (ordenarPorVencimiento) {
      // Orden rápido previo
      list = [...list].sort((a, b) => {
        const fa = a.proxima_vencimiento;
        const fb = b.proxima_vencimiento;
        if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
        return 0;
      });
    }

    return list;
  }, [productos, categoriaSeleccionada, soloConVencimiento, ordenarPorVencimiento, sort]);

  const allVisibleSelected =
    productosFiltrados.length > 0 &&
    productosFiltrados.every((p) => selectedIds.has(p.id));

  // Selecciones
  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) {
        for (const p of productosFiltrados) n.delete(p.id);
      } else {
        for (const p of productosFiltrados) n.add(p.id);
      }
      return n;
    });
  };

  // Expandir
  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Borrar masivo
  const handleDeleteSelected = async () => {
    setMsg(""); setErr("");
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} producto(s) seleccionados? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    try {
      const rowsToDelete = productos.filter((p) => selectedIds.has(p.id));
      const { error } = await supabase.from("Stock").delete().in("id", ids).eq("almacen_id", almacen_id);
      if (error) throw error;

      setProductos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setExpanded((prev) => {
        const n = new Set(prev);
        for (const id of ids) n.delete(id);
        return n;
      });
      setMsg("Productos eliminados correctamente.");
      setLastAction({ type: "delete", items: rowsToDelete.map((r) => ({ row: { ...r } })) });
    } catch (e) {
      setErr(e.message || "No se pudieron eliminar los productos seleccionados.");
    } finally {
      setDeleting(false);
    }
  };

  // Borrar por fila
  const handleDeleteOne = async (id, nombre) => {
    setMsg(""); setErr("");
    if (!window.confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const row = productos.find((p) => p.id === id);
      const { error } = await supabase.from("Stock").delete().eq("id", id).eq("almacen_id", almacen_id);
      if (error) throw error;

      setProductos((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setMsg("Producto eliminado.");
      setLastAction({ type: "delete", items: [{ row: { ...row } }] });
    } catch (e) {
      setErr(e.message || "No se pudo eliminar el producto.");
    }
  };

  // Editar (producto + lotes)
  const startEdit = (p) => {
    setEditingId(p.id);
    setEditValues({
      nombre: p.nombre ?? "",
      cantidad: String(p.cantidad ?? ""),
      categoria: p.categoria ?? "",
    });
    setMsg(""); setErr("");

    const ls = lotesMap[p.id] || [];
    if (hasDesglose(p.id)) {
      setExpanded((prev) => {
        const n = new Set(prev);
        n.add(p.id);
        return n;
      });
    }

    setEditLotesSnapshot((snap) => ({
      ...snap,
      [p.id]: ls.map((l) => ({ id: l.id, fecha_vencimiento: l.fecha_vencimiento, cantidad: l.cantidad })),
    }));
    const dateInit = {};
    const qtyInit = {};
    for (const l of ls) {
      dateInit[l.id] = l.fecha_vencimiento || "";
      qtyInit[l.id] = String(l.cantidad ?? 0);
    }
    setEditedLoteDates((v) => ({ ...v, ...dateInit }));
    setEditedLoteQty((v) => ({ ...v, ...qtyInit }));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({ nombre: "", cantidad: "", categoria: "" });
    setEditedLoteDates({});
    setEditedLoteQty({});
    setEditLotesSnapshot({});
  };

  const recalcProximaForList = (ls) => {
    const filtered = (ls || []).filter(x => Number(x.cantidad) > 0);
    let min = null;
    for (const l of filtered) {
      if (!l.fecha_vencimiento) continue;
      if (min === null || l.fecha_vencimiento < min) min = l.fecha_vencimiento;
    }
    return min;
  };
  const recalcProximaFor = (stockId) => {
    const ls = lotesMap[stockId] || [];
    const min = recalcProximaForList(ls);
    setProductos((prev) => prev.map((p) => (p.id === stockId ? { ...p, proxima_vencimiento: min } : p)));
  };

  const saveEdit = async (id) => {
    setMsg(""); setErr("");
    const prevRow = productos.find((p) => p.id === id);
    const ls = lotesMap[id] || [];
    const usarDesglose = hasDesglose(id);

    // 1) Producto
    const payloadProd = {
      nombre: (editValues.nombre || "").trim(),
      categoria: (editValues.categoria || "").trim() || null,
    };
    if (!usarDesglose) {
      if (editValues.cantidad === "") payloadProd.cantidad = null;
      else {
        const n = Number(editValues.cantidad);
        if (!Number.isFinite(n) || n < 0) { setErr("Cantidad inválida."); return; }
        payloadProd.cantidad = n;
      }
    }

    // Para UNDO
    const prodPrev = { nombre: prevRow?.nombre, cantidad: prevRow?.cantidad, categoria: prevRow?.categoria };
    const prodNext = { ...payloadProd };

    // 2) Cambios en lotes
    const loteChanges = []; // { id, prev:{fecha,cantidad}, next:{fecha,cantidad} }
    try {
      // a) Actualizar producto si cambió
      const changedProd =
        prevRow?.nombre !== payloadProd.nombre ||
        prevRow?.categoria !== payloadProd.categoria ||
        (!usarDesglose && (prevRow?.cantidad ?? null) !== (payloadProd.cantidad ?? null));

      if (changedProd) {
        const { error: upErr } = await supabase
          .from("Stock")
          .update(payloadProd)
          .eq("id", id)
          .eq("almacen_id", almacen_id);
        if (upErr) throw upErr;

        setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, ...payloadProd } : p)));
      }

      // b) Si hay desglose, actualizar lotes y recalcular cantidad total
      let anyLoteChange = false;
      if (usarDesglose) {
        const newLs = ls.map(l => ({ ...l }));
        for (const l of newLs) {
          const newFecha = editedLoteDates[l.id] !== undefined
            ? (editedLoteDates[l.id] === "" ? null : editedLoteDates[l.id])
            : l.fecha_vencimiento;

          const qtyStr = editedLoteQty[l.id];
          let newQty = l.cantidad;
          if (qtyStr !== undefined) {
            const n = Number(qtyStr);
            if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
              setErr("Cantidad de lote inválida (entero ≥ 0).");
              return;
            }
            newQty = n;
          }

          if (newFecha !== l.fecha_vencimiento || newQty !== l.cantidad) {
            const { error: lErr } = await supabase
              .from("Lotes")
              .update({ fecha_vencimiento: newFecha, cantidad: newQty })
              .eq("id", l.id);
            if (lErr) throw lErr;

            loteChanges.push({
              id: l.id,
              prev: { fecha: l.fecha_vencimiento, cantidad: l.cantidad },
              next: { fecha: newFecha, cantidad: newQty },
            });

            l.fecha_vencimiento = newFecha;
            l.cantidad = newQty;
            anyLoteChange = true;
          }
        }

        if (anyLoteChange) {
          // filtrar lotes en memoria que queden > 0
          const filtered = newLs.filter(x => Number(x.cantidad) > 0);
          // cantidad total
          const newTotal = filtered.reduce((acc, x) => acc + Number(x.cantidad || 0), 0);
          const { error: upStockErr } = await supabase
            .from("Stock")
            .update({ cantidad: newTotal })
            .eq("id", id)
            .eq("almacen_id", almacen_id);
          if (upStockErr) throw upStockErr;

          setLotesMap((prev) => ({ ...prev, [id]: filtered }));
          setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, cantidad: newTotal } : p)));

          const min = recalcProximaForList(filtered);
          setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, proxima_vencimiento: min } : p)));
        }
      }

      // Registrar UNDO (producto + lotes)
      setLastAction({
        type: "update",
        items: [{ id, prev: prodPrev, next: prodNext }],
        lotes: loteChanges.length ? [{ stockId: id, changes: loteChanges }] : [],
      });

      setMsg((loteChanges.length || changedProd) ? "Producto actualizado." : "No hubo cambios.");
      cancelEdit();
    } catch (e) {
      setErr(e.message || "No se pudo actualizar.");
    }
  };

  // Edición masiva
  const applyBulkChange = async () => {
    setMsg(""); setErr("");
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return setErr("No hay productos seleccionados.");
    if (bulkAction === "none") return setErr("Elegí una acción masiva.");

    const payload = {};
    if (bulkAction === "categoria") {
      payload.categoria = (bulkCategoria || "").trim() || null;
    } else if (bulkAction === "cantidad") {
      if (bulkCantidad === "") return setErr("Indicá una cantidad.");
      const n = Number(bulkCantidad);
      if (!Number.isFinite(n) || n < 0) return setErr("Cantidad inválida.");
      payload.cantidad = n;
    }

    setApplyingBulk(true);
    try {
      const prevMap = new Map();
      for (const p of productos) {
        if (selectedIds.has(p.id)) prevMap.set(p.id, { nombre: p.nombre, cantidad: p.cantidad, categoria: p.categoria });
      }

      const { error } = await supabase.from("Stock").update(payload).in("id", ids).eq("almacen_id", almacen_id);
      if (error) throw error;

      setProductos((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, ...payload } : p)));
      setMsg("Edición masiva aplicada.");
      const items = ids.map((id) => ({ id, prev: prevMap.get(id), next: { ...payload } }));
      setLastAction({ type: "bulk_update", items });
    } catch (e) {
      setErr(e.message || "No se pudo aplicar la edición masiva.");
    } finally {
      setApplyingBulk(false);
    }
  };

  // UNDO (productos + lotes)
  const handleUndo = async () => {
    if (!lastAction) return;
    setErr(""); setMsg("");

    try {
      if (lastAction.type === "delete") {
        const rows = lastAction.items.map(({ row }) => ({
          id: row.id, nombre: row.nombre, cantidad: row.cantidad, categoria: row.categoria, almacen_id: row.almacen_id,
        }));
        const { error } = await supabase.from("Stock").insert(rows);
        if (error) throw error;

        setProductos((prev) => {
          const ids = new Set(rows.map((r) => r.id));
          const restored = rows.map((r) => ({ ...r, proxima_vencimiento: null }));
          return [...prev.filter((p) => !ids.has(p.id)), ...restored].sort((a, b) => Number(a.id) - Number(b.id));
        });
        setMsg("Deshacer: productos restaurados (los lotes no se restauran).");
      }

      if (lastAction.type === "update" || lastAction.type === "bulk_update") {
        // 1) Revertir producto(s)
        for (const it of lastAction.items) {
          const id = it.id;
          const prevVals = it.prev || {};
          const payload = {};
          if ("nombre" in prevVals) payload.nombre = prevVals.nombre ?? null;
          if ("cantidad" in prevVals) payload.cantidad = prevVals.cantidad ?? null;
          if ("categoria" in prevVals) payload.categoria = prevVals.categoria ?? null;

          const { error } = await supabase.from("Stock").update(payload).eq("id", id).eq("almacen_id", almacen_id);
          if (error) throw error;
        }
        setProductos((prev) =>
          prev.map((p) => {
            const it = lastAction.items.find((x) => x.id === p.id);
            return it ? { ...p, ...it.prev } : p;
          })
        );

        // 2) Revertir lotes, si existieron cambios
        if (lastAction.lotes && lastAction.lotes.length) {
          for (const group of lastAction.lotes) {
            const stockId = group.stockId;
            // revertir cada lote
            for (const ch of group.changes) {
              const { error: lErr } = await supabase
                .from("Lotes")
                .update({ fecha_vencimiento: ch.prev.fecha, cantidad: ch.prev.cantidad })
                .eq("id", ch.id);
              if (lErr) throw lErr;
            }

            // actualizar estado local lotesMap
            setLotesMap((prev) => {
              const current = prev[stockId] || [];
              const updated = current
                .map((l) => {
                  const ch = group.changes.find((x) => x.id === l.id);
                  return ch ? { ...l, fecha_vencimiento: ch.prev.fecha, cantidad: ch.prev.cantidad } : l;
                })
                .filter(x => Number(x.cantidad) > 0);
              return { ...prev, [stockId]: updated };
            });

            // cantidad total y próxima fecha, y persistir en Stock
            const updatedForCalc = (() => {
              const current = lotesMap[stockId] || [];
              const after = current
                .map((l) => {
                  const ch = group.changes.find((x) => x.id === l.id);
                  return ch ? { ...l, fecha_vencimiento: ch.prev.fecha, cantidad: ch.prev.cantidad } : l;
                })
                .filter(x => Number(x.cantidad) > 0);
              return after;
            })();

            const newTotal = updatedForCalc.reduce((acc, x) => acc + Number(x.cantidad || 0), 0);
            const min = recalcProximaForList(updatedForCalc);

            const { error: upStockErr } = await supabase
              .from("Stock")
              .update({ cantidad: newTotal })
              .eq("id", stockId)
              .eq("almacen_id", almacen_id);
            if (upStockErr) throw upStockErr;

            setProductos((prev) =>
              prev.map((p) => (p.id === stockId ? { ...p, cantidad: newTotal, proxima_vencimiento: min } : p))
            );
          }
          setMsg("Deshacer: cambios de producto y lotes revertidos.");
        } else {
          setMsg("Deshacer: cambios revertidos.");
        }
      }

      setLastAction(null);
    } catch (e) {
      setErr(e.message || "No se pudo deshacer la última acción.");
    }
  };

  // UI
  const sortLabel = (key, label) => {
    const is = sort.key === key;
    return (
      <button
        onClick={() => handleSort(key)}
        className={"inline-flex items-center gap-1 select-none hover:text-blue-700"}
        title={"Ordenar por " + label}
      >
        <span>{label}</span>
        <span className="text-xs opacity-70">
          {is ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  };

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full sm:max-w-3xl md:max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <Link
          to="/"
          className="inline-block text-sm text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
        >
          ← Volver al menú
        </Link>

        {/* Header + acciones: apilado en mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Stock Actual</h2>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={handleUndo}
              disabled={!lastAction}
              className={
                "inline-flex items-center gap-2 px-2.5 py-2 sm:px-3 rounded-lg text-sm whitespace-nowrap transition " +
                (!lastAction
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300")
              }
              title="Deshacer última acción"
            >
              <FaUndo />
              <span className="hidden sm:inline">&nbsp;Deshacer</span>
            </button>

            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0 || deleting}
              className={
                "inline-flex items-center gap-2 px-2.5 py-2 sm:px-3 rounded-lg text-sm whitespace-nowrap transition " +
                (selectedIds.size === 0 || deleting
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700 text-white")
              }
              title="Eliminar seleccionados"
            >
              <FaTrash />
              <span className="hidden sm:inline">&nbsp;Eliminar seleccionados</span>
            </button>

            <button
              onClick={() => setMostrarFiltros((v) => !v)}
              className="text-sm px-2.5 py-2 sm:px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
              aria-expanded={mostrarFiltros}
              aria-controls="panel-filtros"
            >
              {mostrarFiltros ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
          </div>
        </div>

        {msg && <div className="text-sm text-green-800 bg-green-100 px-3 py-2 rounded-lg">{msg}</div>}
        {err && <div className="text-sm text-red-800 bg-red-100 px-3 py-2 rounded-lg">{err}</div>}

        {mostrarFiltros && (
          <div id="panel-filtros" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 text-sm text-gray-900">Categoría</label>
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              >
                <option value="">Todas</option>
                {categorias.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm text-gray-900">Vencimiento</label>
              <div className="flex items-center h-10 gap-2">
                <input id="soloConVto" type="checkbox" checked={soloConVencimiento} onChange={(e) => setSoloConVencimiento(e.target.checked)} />
                <label htmlFor="soloConVto" className="text-sm text-gray-900">Solo con fecha de vencimiento</label>
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm text-gray-900">Orden rápido</label>
              <div className="flex items-center h-10 gap-2">
                <input
                  id="ordenVto"
                  type="checkbox"
                  checked={ordenarPorVencimiento}
                  onChange={(e) => { setSort({key:null, dir:"asc"}); setOrdenarPorVencimiento(e.target.checked); }}
                />
                <label htmlFor="ordenVto" className="text-sm text-gray-900">Próximos a vencer primero</label>
              </div>
            </div>
          </div>
        )}

        {/* Acciones MASIVAS */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-900">Acción masiva para seleccionados:</span>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="px-3 py-2 border rounded-lg bg-white text-gray-900 border-gray-300 w-full sm:w-auto"
            >
              <option value="none">Elegir acción…</option>
              <option value="categoria">Cambiar categoría</option>
              <option value="cantidad">Establecer cantidad</option>
            </select>

            {bulkAction === "categoria" && (
              <input
                type="text"
                placeholder="Nueva categoría (vacío = null)"
                value={bulkCategoria}
                onChange={(e) => setBulkCategoria(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-white text-gray-900 border-gray-300 w-full sm:w-auto min-w-0"
              />
            )}

            {bulkAction === "cantidad" && (
              <input
                type="number"
                min="0"
                placeholder="Cantidad"
                value={bulkCantidad}
                onChange={(e) => setBulkCantidad(e.target.value)}
                className="px-3 py-2 border rounded-lg w-full sm:w-auto min-w-0 bg-white text-gray-900 border-gray-300"
              />
            )}

            <button
              onClick={applyBulkChange}
              disabled={selectedIds.size === 0 || applyingBulk || bulkAction === "none"}
              className={
                "px-3 py-2 rounded-lg text-sm w-full sm:w-auto transition " +
                (selectedIds.size === 0 || applyingBulk || bulkAction === "none"
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white")
              }
            >
              {applyingBulk ? "Aplicando…" : "Aplicar"}
            </button>

            <span className="text-xs sm:text-sm text-gray-700 sm:ml-auto w-full sm:w-auto">
              Seleccionados: {selectedIds.size}
            </span>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm text-gray-900">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 sm:px-4 py-2 border text-center">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Seleccionar todos" />
                </th>
                <th className="px-3 sm:px-4 py-2 border cursor-pointer">{sortLabel("nombre", "Producto")}</th>
                <th className="px-3 sm:px-4 py-2 border cursor-pointer">{sortLabel("cantidad", "Cantidad")}</th>
                <th className="px-3 sm:px-4 py-2 border cursor-pointer">{sortLabel("categoria", "Categoría")}</th>
                <th className="px-3 sm:px-4 py-2 border cursor-pointer">{sortLabel("proxima_vencimiento", "Próx. vencimiento")}</th>
                <th className="px-3 sm:px-4 py-2 border text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p) => {
                const isEditing = editingId === p.id;
                const ls = lotesMap[p.id] || [];
                const desglose = hasDesglose(p.id);

                const cantidadVista = isEditing && desglose
                  ? `${sumEditedQty(ls)}`
                  : (p.cantidad ?? "-");

                return (
                  <>
                    <tr key={p.id} className="odd:bg-white even:bg-gray-50">
                      <td className="border px-3 sm:px-4 py-2 text-center align-middle">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} aria-label={`Seleccionar ${p.nombre}`} />
                      </td>

                      {/* Producto */}
                      <td className="border px-3 sm:px-4 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          {desglose ? (
                            <button onClick={() => toggleExpand(p.id)} className="p-1 rounded hover:bg-gray-100" title={expanded.has(p.id) ? "Contraer" : "Desplegar"}>
                              {expanded.has(p.id) ? <FaChevronDown /> : <FaChevronRight />}
                            </button>
                          ) : <span className="w-4" />}

                          {isEditing ? (
                            <input
                              type="text"
                              value={editValues.nombre}
                              onChange={(e) => setEditValues((v) => ({ ...v, nombre: e.target.value }))}
                              className="w-full border rounded-lg px-2 py-1 bg-white text-gray-900 border-gray-300"
                              placeholder="Nombre"
                            />
                          ) : (
                            <span>{p.nombre}</span>
                          )}
                        </div>
                      </td>

                      {/* Cantidad */}
                      <td className="border px-3 sm:px-4 py-2 align-middle">
                        {isEditing ? (
                          desglose ? (
                            <div>
                              <div className="font-medium">{cantidadVista}</div>
                              <div className="text-[10px] sm:text-xs text-gray-500">(auto, suma de lotes)</div>
                            </div>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={editValues.cantidad}
                              onChange={(e) => setEditValues((v) => ({ ...v, cantidad: e.target.value }))}
                              className="w-28 border rounded-lg px-2 py-1 bg-white text-gray-900 border-gray-300"
                              placeholder="0"
                            />
                          )
                        ) : (
                          cantidadVista
                        )}
                      </td>

                      {/* Categoría */}
                      <td className="border px-3 sm:px-4 py-2 align-middle">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.categoria}
                            onChange={(e) => setEditValues((v) => ({ ...v, categoria: e.target.value }))}
                            className="w-full border rounded-lg px-2 py-1 bg-white text-gray-900 border-gray-300"
                            placeholder="Categoría"
                          />
                        ) : (
                          p.categoria || "-"
                        )}
                      </td>

                      {/* Próx. vencimiento */}
                      <td className="border px-3 sm:px-4 py-2 align-middle">
                        {p.proxima_vencimiento ? p.proxima_vencimiento : "-"}
                      </td>

                      {/* Acciones */}
                      <td className="border px-3 sm:px-4 py-2 text-center align-middle">
                        {!isEditing ? (
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              onClick={() => startEdit(p)}
                              className="inline-flex items-center gap-2 px-2.5 py-2 sm:px-3 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-900 text-sm whitespace-nowrap"
                              title="Editar"
                            >
                              <FaEdit />
                              <span className="hidden sm:inline">&nbsp;Editar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteOne(p.id, p.nombre)}
                              className="inline-flex items-center gap-2 px-2.5 py-2 sm:px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm whitespace-nowrap"
                              title="Eliminar"
                            >
                              <FaTrash />
                              <span className="hidden sm:inline">&nbsp;Borrar</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              onClick={() => saveEdit(p.id)}
                              className="px-2.5 py-2 sm:px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm whitespace-nowrap"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2.5 py-2 sm:px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm whitespace-nowrap"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Desglose expandible (≥ 2 fechas) */}
                    {expanded.has(p.id) && desglose && (
                      <tr>
                        <td colSpan={6} className="border px-3 sm:px-4 py-3 bg-gray-50">
                          <div className="grid md:grid-cols-2 gap-4">
                            {/* Resumen por fecha */}
                            <div>
                              <h4 className="font-semibold mb-2 text-gray-900">Cantidad por fecha de vencimiento</h4>
                              <table className="min-w-full text-xs sm:text-sm">
                                <thead>
                                  <tr className="text-left">
                                    <th className="py-1 pr-4 text-gray-900">Fecha</th>
                                    <th className="py-1 pr-4 text-gray-900">Cantidad</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {aggregateLotes(p.id).map((r, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="py-1 pr-4">{r.fecha ?? <span className="italic text-gray-700">Sin fecha</span>}</td>
                                      <td className="py-1 pr-4">{r.cantidad}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className="mt-2 text-[11px] sm:text-xs text-gray-600">(Se despliega cuando hay ≥ 2 fechas distintas)</p>
                            </div>

                            {/* Edición por lote */}
                            <div>
                              <h4 className="font-semibold mb-2 text-gray-900">{editingId === p.id ? "Editar lotes" : "Lotes"}</h4>
                              <div className="space-y-2">
                                {(lotesMap[p.id] || []).map((l) => (
                                  <div key={l.id} className="grid grid-cols-12 items-center gap-2">
                                    <div className="col-span-5 sm:col-span-4 text-xs sm:text-sm text-gray-900">
                                      Cantidad:
                                      {editingId === p.id ? (
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={editedLoteQty[l.id] ?? String(l.cantidad ?? 0)}
                                          onChange={(e) => setEditedLoteQty((v) => ({ ...v, [l.id]: e.target.value }))}
                                          className="ml-2 w-24 border rounded-lg px-2 py-1 bg-white text-gray-900 border-gray-300"
                                        />
                                      ) : (
                                        <span className="ml-1 font-medium">{l.cantidad}</span>
                                      )}
                                    </div>
                                    <div className="col-span-7 sm:col-span-5">
                                      {editingId === p.id ? (
                                        <input
                                          type="date"
                                          value={editedLoteDates[l.id] ?? (l.fecha_vencimiento || "")}
                                          onChange={(e) => setEditedLoteDates((v) => ({ ...v, [l.id]: e.target.value }))}
                                          className="border rounded-lg px-2 py-1 bg-white text-gray-900 border-gray-300 w-full sm:w-auto"
                                        />
                                      ) : (
                                        <div className="text-xs sm:text-sm text-gray-900">
                                          {l.fecha_vencimiento || <span className="italic text-gray-700">Sin fecha</span>}
                                        </div>
                                      )}
                                    </div>
                                    <div className="col-span-12 sm:col-span-3 text-[11px] sm:text-xs text-gray-500">Lote: {l.id}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center text-gray-700 px-3 sm:px-4 py-6">
                    No hay productos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
