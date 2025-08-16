// Stock.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Link, useNavigate } from "react-router-dom";
import { FaEdit, FaTrash, FaUndo } from "react-icons/fa";

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
  const [bulkAction, setBulkAction] = useState("none"); // 'none' | 'categoria' | 'cantidad'
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [bulkCantidad, setBulkCantidad] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Undo (una sola acción a la vez)
  // lastAction =
  // { type: 'delete'|'update'|'bulk_update',
  //   items: [{ id, prev: {...}, next?: {...}, row?: {...productoCompleto} }] }
  const [lastAction, setLastAction] = useState(null);

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
      // 1) Traer productos del Stock (incluimos almacen_id para poder restaurar)
      const { data: stock, error } = await supabase
        .from("Stock")
        .select("id, nombre, cantidad, categoria, almacen_id")
        .eq("almacen_id", almacen_id);

      if (error) {
        console.error("Error al cargar stock", error);
        setErr(error.message || "Error al cargar stock.");
        return;
      }
      if (!stock || stock.length === 0) {
        setProductos([]);
        setCategorias([]);
        return;
      }

      // 2) Traer lotes con fecha_vencimiento y cantidad > 0
      const stockIds = stock.map((s) => s.id);
      const { data: lotes, error: lotesErr } = await supabase
        .from("Lotes")
        .select("stock_id, fecha_vencimiento, cantidad")
        .in("stock_id", stockIds)
        .gt("cantidad", 0)
        .not("fecha_vencimiento", "is", null)
        .order("fecha_vencimiento", { ascending: true });

      if (lotesErr) {
        console.error("Error al cargar lotes", lotesErr);
      }

      // 3) Próxima fecha de vencimiento por stock
      const minVencPorStock = new Map();
      if (lotes && lotes.length > 0) {
        for (const l of lotes) {
          const f = l.fecha_vencimiento; // 'YYYY-MM-DD'
          if (!minVencPorStock.has(l.stock_id) || f < minVencPorStock.get(l.stock_id)) {
            minVencPorStock.set(l.stock_id, f);
          }
        }
      }

      // 4) Mezcla
      const enriquecidos = stock.map((s) => ({
        ...s,
        proxima_vencimiento: minVencPorStock.get(s.id) || null,
      }));
      setProductos(enriquecidos);

      // 5) Categorías únicas
      const categoriasUnicas = [...new Set(enriquecidos.map((p) => p.categoria).filter(Boolean))];
      setCategorias(categoriasUnicas);
      setSelectedIds(new Set()); // limpiar selección al recargar
      setLastAction(null); // limpiamos historial al recargar
    };

    fetchStock();
  }, [almacen_id, navigate]);

  // Filtros y orden
  const productosFiltrados = useMemo(() => {
    let list = categoriaSeleccionada
      ? productos.filter((p) => p.categoria === categoriaSeleccionada)
      : productos;

    if (soloConVencimiento) {
      list = list.filter((p) => p.proxima_vencimiento !== null);
    }

    if (ordenarPorVencimiento) {
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
  }, [productos, categoriaSeleccionada, soloConVencimiento, ordenarPorVencimiento]);

  const allVisibleSelected =
    productosFiltrados.length > 0 &&
    productosFiltrados.every((p) => selectedIds.has(p.id));

  // Selecciones
  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
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

  // Borrado masivo
  const handleDeleteSelected = async () => {
    setMsg(""); setErr("");
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = window.confirm(
      `¿Eliminar ${ids.length} producto(s) seleccionados? Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      // Guardamos copia para UNDO
      const rowsToDelete = productos.filter((p) => selectedIds.has(p.id));
      const { error } = await supabase
        .from("Stock")
        .delete()
        .in("id", ids)
        .eq("almacen_id", almacen_id);

      if (error) throw error;

      setProductos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setMsg("Productos eliminados correctamente.");

      // Registrar acción para undo (nota: lotes NO se restauran)
      setLastAction({
        type: "delete",
        items: rowsToDelete.map((r) => ({ row: { ...r } })),
      });
    } catch (e) {
      console.error(e);
      setErr(e.message || "No se pudieron eliminar los productos seleccionados.");
    } finally {
      setDeleting(false);
    }
  };

  // Borrado por fila
  const handleDeleteOne = async (id, nombre) => {
    setMsg(""); setErr("");
    const ok = window.confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    try {
      const row = productos.find((p) => p.id === id);
      const { error } = await supabase
        .from("Stock")
        .delete()
        .eq("id", id)
        .eq("almacen_id", almacen_id);

      if (error) throw error;

      setProductos((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      setMsg("Producto eliminado.");

      // Registrar acción para undo
      if (row) {
        setLastAction({ type: "delete", items: [{ row: { ...row } }] });
      }
    } catch (e) {
      console.error(e);
      setErr(e.message || "No se pudo eliminar el producto.");
    }
  };

  // Edición inline
  const startEdit = (p) => {
    setEditingId(p.id);
    setEditValues({
      nombre: p.nombre ?? "",
      cantidad: String(p.cantidad ?? ""),
      categoria: p.categoria ?? "",
    });
    setMsg(""); setErr("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({ nombre: "", cantidad: "", categoria: "" });
  };

  const saveEdit = async (id) => {
    setMsg(""); setErr("");
    const payload = {
      nombre: (editValues.nombre || "").trim(),
      categoria: (editValues.categoria || "").trim() || null,
    };

    const cant = editValues.cantidad === "" ? null : Number(editValues.cantidad);
    if (editValues.cantidad !== "" && (!Number.isFinite(cant) || cant < 0)) {
      setErr("Cantidad inválida.");
      return;
    }
    payload.cantidad = cant;

    try {
      const prevRow = productos.find((p) => p.id === id);
      const { error } = await supabase
        .from("Stock")
        .update(payload)
        .eq("id", id)
        .eq("almacen_id", almacen_id);

      if (error) throw error;

      setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
      setMsg("Producto actualizado.");
      setLastAction({
        type: "update",
        items: [{ id, prev: { nombre: prevRow?.nombre, cantidad: prevRow?.cantidad, categoria: prevRow?.categoria }, next: { ...payload } }],
      });
      cancelEdit();
    } catch (e) {
      console.error(e);
      setErr(e.message || "No se pudo actualizar el producto.");
    }
  };

  // Edición MASIVA
  const applyBulkChange = async () => {
    setMsg(""); setErr("");
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setErr("No hay productos seleccionados.");
      return;
    }
    if (bulkAction === "none") {
      setErr("Elegí una acción masiva.");
      return;
    }

    const payload = {};
    if (bulkAction === "categoria") {
      payload.categoria = (bulkCategoria || "").trim() || null;
    } else if (bulkAction === "cantidad") {
      if (bulkCantidad === "") {
        setErr("Indicá una cantidad.");
        return;
      }
      const n = Number(bulkCantidad);
      if (!Number.isFinite(n) || n < 0) {
        setErr("Cantidad inválida.");
        return;
      }
      payload.cantidad = n;
    }

    setApplyingBulk(true);
    try {
      // Capturamos prev por id
      const prevMap = new Map();
      for (const p of productos) {
        if (selectedIds.has(p.id)) {
          prevMap.set(p.id, { nombre: p.nombre, cantidad: p.cantidad, categoria: p.categoria });
        }
      }

      const { error } = await supabase
        .from("Stock")
        .update(payload)
        .in("id", ids)
        .eq("almacen_id", almacen_id);

      if (error) throw error;

      setProductos((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, ...payload } : p))
      );
      setMsg("Edición masiva aplicada.");

      // Registrar acción para undo
      const items = ids.map((id) => ({
        id,
        prev: prevMap.get(id),
        next: { ...payload },
      }));
      setLastAction({ type: "bulk_update", items });
    } catch (e) {
      console.error(e);
      setErr(e.message || "No se pudo aplicar la edición masiva.");
    } finally {
      setApplyingBulk(false);
    }
  };

  // UNDO
  const handleUndo = async () => {
    if (!lastAction) return;
    setErr(""); setMsg("");

    try {
      if (lastAction.type === "delete") {
        // Reinsertar filas (nota: Lotes eliminados por cascade NO se restauran)
        const rows = lastAction.items.map(({ row }) => ({
          id: row.id, // permitida porque es GENERATED BY DEFAULT
          nombre: row.nombre,
          cantidad: row.cantidad,
          categoria: row.categoria,
          almacen_id: row.almacen_id,
        }));

        const { error } = await supabase.from("Stock").insert(rows);
        if (error) throw error;

        // En UI: agregamos de vuelta (vencimiento quedará null si se perdieron lotes)
        setProductos((prev) => {
          const ids = new Set(rows.map((r) => r.id));
          const restored = rows.map((r) => ({ ...r, proxima_vencimiento: null }));
          return [...prev.filter((p) => !ids.has(p.id)), ...restored].sort((a, b) => Number(a.id) - Number(b.id));
        });
        setMsg("Deshacer: productos restaurados (los lotes no se restauran).");
      }

      if (lastAction.type === "update" || lastAction.type === "bulk_update") {
        // Revertir a prev valores
        // Agrupamos en un payload por fila (hacemos updates por cada id para simplicidad/claridad)
        for (const it of lastAction.items) {
          const id = it.id ?? it.prev?.id; // seguro viene como it.id
          const prevVals = it.prev || {};
          // Solo mandamos columnas relevantes
          const payload = {};
          if ("nombre" in prevVals) payload.nombre = prevVals.nombre ?? null;
          if ("cantidad" in prevVals) payload.cantidad = prevVals.cantidad ?? null;
          if ("categoria" in prevVals) payload.categoria = prevVals.categoria ?? null;

          const { error } = await supabase
            .from("Stock")
            .update(payload)
            .eq("id", id)
            .eq("almacen_id", almacen_id);
          if (error) throw error;
        }

        // UI
        setProductos((prev) =>
          prev.map((p) => {
            const it = lastAction.items.find((x) => x.id === p.id);
            if (!it) return p;
            return { ...p, ...it.prev };
          })
        );
        setMsg("Deshacer: cambios revertidos.");
      }

      setLastAction(null);
    } catch (e) {
      console.error(e);
      setErr(e.message || "No se pudo deshacer la última acción.");
    }
  };

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full sm:max-w-3xl mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <Link
          to="/"
          className="inline-block text-sm text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
        >
          ← Volver al menú
        </Link>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Stock Actual</h2>

          {/* Toolbar de acciones */}
          <div className="flex items-center gap-2">
            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={!lastAction}
              className={
                "inline-flex items-center gap-2 px-3 py-2 rounded-lg transition " +
                (!lastAction
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300")
              }
              title="Deshacer última acción"
            >
              <FaUndo />
              Deshacer
            </button>

            {/* Borrado masivo */}
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0 || deleting}
              className={
                "inline-flex items-center gap-2 px-3 py-2 rounded-lg transition " +
                (selectedIds.size === 0 || deleting
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700 text-white")
              }
              title="Eliminar seleccionados"
            >
              <FaTrash />
              Eliminar seleccionados
            </button>

            {/* Filtros */}
            <button
              onClick={() => setMostrarFiltros((v) => !v)}
              className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition"
              aria-expanded={mostrarFiltros}
              aria-controls="panel-filtros"
            >
              {mostrarFiltros ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
          </div>
        </div>

        {/* Mensajes */}
        {msg && <div className="text-sm text-green-800 bg-green-100 px-3 py-2 rounded-lg">{msg}</div>}
        {err && <div className="text-sm text-red-800 bg-red-100 px-3 py-2 rounded-lg">{err}</div>}
        {lastAction?.type && (
          <div className="text-xs text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
            Última acción: <span className="font-medium">{lastAction.type}</span>
          </div>
        )}

        {/* Panel de filtros */}
        {mostrarFiltros && (
          <div id="panel-filtros" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Categoría */}
            <div>
              <label className="block mb-1 text-sm text-gray-900">Categoría</label>
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              >
                <option value="">Todas</option>
                {categorias.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Solo con vencimiento */}
            <div>
              <label className="block mb-1 text-sm text-gray-900">Vencimiento</label>
              <div className="flex items-center h-10 gap-2">
                <input
                  id="soloConVto"
                  type="checkbox"
                  checked={soloConVencimiento}
                  onChange={(e) => setSoloConVencimiento(e.target.checked)}
                />
                <label htmlFor="soloConVto" className="text-sm text-gray-900">
                  Solo con fecha de vencimiento
                </label>
              </div>
            </div>

            {/* Ordenar por próximos a vencer */}
            <div>
              <label className="block mb-1 text-sm text-gray-900">Orden</label>
              <div className="flex items-center h-10 gap-2">
                <input
                  id="ordenVto"
                  type="checkbox"
                  checked={ordenarPorVencimiento}
                  onChange={(e) => setOrdenarPorVencimiento(e.target.checked)}
                />
                <label htmlFor="ordenVto" className="text-sm text-gray-900">
                  Próximos a vencer primero
                </label>
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
              className="px-3 py-2 border rounded-lg bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="px-3 py-2 border rounded-lg"
              />
            )}

            {bulkAction === "cantidad" && (
              <input
                type="number"
                min="0"
                placeholder="Cantidad"
                value={bulkCantidad}
                onChange={(e) => setBulkCantidad(e.target.value)}
                className="px-3 py-2 border rounded-lg w-28"
              />
            )}

            <button
              onClick={applyBulkChange}
              disabled={selectedIds.size === 0 || applyingBulk || bulkAction === "none"}
              className={
                "px-3 py-2 rounded-lg transition " +
                (selectedIds.size === 0 || applyingBulk || bulkAction === "none"
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white")
              }
            >
              {applyingBulk ? "Aplicando…" : "Aplicar"}
            </button>

            <span className="text-sm text-gray-700 ml-auto">
              Seleccionados: {selectedIds.size}
            </span>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-gray-900">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 border text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="px-4 py-2 border">Producto</th>
                <th className="px-4 py-2 border">Cantidad</th>
                <th className="px-4 py-2 border">Categoría</th>
                <th className="px-4 py-2 border">Próx. vencimiento</th>
                <th className="px-4 py-2 border text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id} className="odd:bg-white even:bg-gray-50">
                    <td className="border px-3 py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelectOne(p.id)}
                        aria-label={`Seleccionar ${p.nombre}`}
                      />
                    </td>

                    {/* Nombre */}
                    <td className="border px-4 py-2 align-middle">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues.nombre}
                          onChange={(e) =>
                            setEditValues((v) => ({ ...v, nombre: e.target.value }))
                          }
                          className="w-full border rounded-lg px-2 py-1"
                          placeholder="Nombre"
                        />
                      ) : (
                        p.nombre
                      )}
                    </td>

                    {/* Cantidad */}
                    <td className="border px-4 py-2 align-middle">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          value={editValues.cantidad}
                          onChange={(e) =>
                            setEditValues((v) => ({ ...v, cantidad: e.target.value }))
                          }
                          className="w-28 border rounded-lg px-2 py-1"
                          placeholder="0"
                        />
                      ) : (
                        p.cantidad ?? "-"
                      )}
                    </td>

                    {/* Categoría */}
                    <td className="border px-4 py-2 align-middle">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues.categoria}
                          onChange={(e) =>
                            setEditValues((v) => ({ ...v, categoria: e.target.value }))
                          }
                          className="w-full border rounded-lg px-2 py-1"
                          placeholder="Categoría"
                        />
                      ) : (
                        p.categoria || "-"
                      )}
                    </td>

                    {/* Próx. vencimiento */}
                    <td className="border px-4 py-2 align-middle">
                      {p.proxima_vencimiento ? p.proxima_vencimiento : "-"}
                    </td>

                    {/* Acciones */}
                    <td className="border px-4 py-2 text-center align-middle">
                      {!isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(p)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-900"
                            title="Editar"
                          >
                            <FaEdit />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteOne(p.id, p.nombre)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                            title="Eliminar"
                          >
                            <FaTrash />
                            Borrar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => saveEdit(p.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center text-gray-700 px-4 py-6">
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
