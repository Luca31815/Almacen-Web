import { useEffect, useState } from "react";
import { supabase } from "./supabase"
import { Link } from 'react-router-dom'

export default function Ventas() {
  const [nombre, setNombre] = useState("")
  const [productosStock, setProductosStock] = useState([])
  const [cantidadVentas, setCantidadVentas] = useState("")
  const [gananciaBruta, setGananciaBruta] = useState("")
  const [gananciaNeta, setGananciaNeta] = useState("")

  useEffect(() => {
      const cargarProductos = async () => {
        const { data, error } = await supabase.from("Stock").select("nombre")
        if (!error) setProductosStock(data.map((p) => p.nombre))
      }
      cargarProductos()
    }, [])

  const guardarVenta = async () => {
    const cantidadNumero = parseInt(cantidadVentas)

    if (!nombre || isNaN(cantidadNumero) || cantidadNumero <= 0) {
      alert("Por favor completá todos los campos correctamente.")
      return
    }
    
    const nuevaVenta = {
      nombre,
      cantidad: cantidadNumero,
      gananciaBruta: parseFloat(gananciaBruta),
      gananciaNeta: parseFloat(gananciaNeta),
    }

    console.log("Guardando en ventas:", nuevaVenta)

    const { error: ventasError } = await supabase
      .from("Ventas")
      .insert([nuevaVenta])

    if (ventasError) {
      console.error("Error al guardar venta:", ventasError)
      alert("Error al guardar en ventas: " + ventasError.message)
      return
    }

    // Actualizar stock restando la cantidad vendida
    const { data: productoExistente, error: stockSelectError } = await supabase
      .from("Stock")
      .select("*")
      .eq("nombre", nombre)
      .single()

    if (stockSelectError || !productoExistente) {
      console.error("Error al consultar stock:", stockSelectError)
      alert("Producto no encontrado en stock")
      return
    }

    const nuevaCantidad = productoExistente.cantidad - cantidadNumero
    if (nuevaCantidad < 0) {
      alert("No hay suficiente stock disponible")
      return
    }

    const { error: updateError } = await supabase
      .from("Stock")
      .update({ cantidad: nuevaCantidad })
      .eq("nombre", nombre)

    if (updateError) {
      console.error("Error al actualizar stock:", updateError)
      alert("Error al actualizar stock: " + updateError.message)
      return
    }

    // Limpiar campos
    setNombre("")
    setCantidadVentas("")
    setGananciaBruta("")
    setGananciaNeta("")
  }

  return (
    <div className="p-4">
      <Link
      to="/"
      className="inline-block mb-4 bg-blue-500 text-white px-4 py-2 rounded"
    >
      Volver al menú
    </Link>
      <h1 className="text-xl font-bold mb-4">Cargar Venta</h1>
      <input
          list="productos"
          placeholder="Seleccionar o escribir producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border p-2 w-full"
        />
        <datalist id="productos">
          {productosStock.map((prod) => (
            <option key={prod} value={prod} />
          ))}
        </datalist>
      <input
        type="number"
        placeholder="Cantidad Vendida"
        value={cantidadVentas}
        onChange={(e) => setCantidadVentas(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="number"
        placeholder="Ganancia Bruta"
        value={gananciaBruta}
        onChange={(e) => setGananciaBruta(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="number"
        placeholder="Ganancia Neta"
        value={gananciaNeta}
        onChange={(e) => setGananciaNeta(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <button
        onClick={guardarVenta}
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Guardar venta
      </button>
    </div>
  )
}
