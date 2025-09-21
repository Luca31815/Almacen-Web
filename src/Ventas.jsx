// Ventas.jsx — cámara con mejoras: alta resolución, zoom digital (recorte central), zoom hardware (si hay), ZXing TRY_HARDER
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";
import { useToast } from "./ToastProvider";

export default function Ventas() {
  const toast = useToast();

  const [nombre, setNombre] = useState("");
  const [ean, setEan] = useState("");
  const [productosStock, setProductosStock] = useState([]);

  const [stockId, setStockId] = useState(null);
  const [cantidadDisponible, setCantidadDisponible] = useState(0);

  const [cantidadVentas, setCantidadVentas] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");

  // Fechas de vencimiento (info)
  const [fechasVencimiento, setFechasVencimiento] = useState([]); // [{fecha, cantidad}]
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  // Fecha de venta y forma de pago
  const hoyISO = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const [fechaVenta, setFechaVenta] = useState(hoyISO());
  const [formaPago, setFormaPago] = useState("");

  const almacenId = localStorage.getItem("almacen_id");

  // ========= Helpers =========
  const normalizeEan = (s) => (s || "").replace(/\D/g, "");

  // ========= Cámara / Escaneo =========
  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Offscreen para zoom digital (sólo BarcodeDetector)
  const offCanvasRef = useRef(null);
  const [digitalZoom, setDigitalZoom] = useState(1.0); // 1.0 = sin recorte; 1.8-2.0 = más “cerca”

  // BarcodeDetector path
  const [detectorSupported, setDetectorSupported] = useState(false);
  const detectorRef = useRef(null);
  const loopTimerRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);

  // ZXing fallback path
  const [usingZxing, setUsingZxing] = useState(false);
  const zxingReaderRef = useRef(null);
  const zxingControlsRef = useRef(null);

  // Torch + hardware zoom
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasHwZoom, setHasHwZoom] = useState(false);
  const [hwZoom, setHwZoom] = useState(null);

  // Debounce memoria
  const lastHitRef = useRef(new Map()); // ean -> timestamp

  // Acumulador {ean -> cantidad}
  const [scannedMap, setScannedMap] = useState({});

  // Beep breve + vibrar
  const beep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 100);
    } catch {}
  };
  const vibrate = (ms = 60) => {
    try { navigator.vibrate?.(ms); } catch {}
  };

  useEffect(() => {
    setDetectorSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  // ==== Cámara base ====
  const startCamera = async () => {
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        // pedimos 1080p si se puede (más píxeles = mejor detección en símbolos chicos)
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() || {};
      setHasTorch(!!caps.torch);
      setTorchOn(false);
      setHasHwZoom(!!caps.zoom);
      try {
        const settings = track.getSettings?.() || {};
        setHwZoom(settings.zoom ?? null);
        // intento activar autofocus continuo si existe
        if (caps.focusMode && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch {}
    } catch (e) {
      console.error("No se pudo iniciar la cámara:", e);
      toast.error("No se pudo iniciar la cámara. Verificá permisos o el origen (HTTPS/localhost).");
    }
  };

  const stopCamera = () => {
    try {
      // detener loops
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      setIsScanning(false);

      // detener ZXing
      try {
        zxingControlsRef.current?.stop();
        zxingReaderRef.current?.reset?.();
      } catch {}

      // detener stream
      const stream = streamRef.current || (videoRef.current?.srcObject ?? null);
      stream?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setUsingZxing(false);
    } catch (e) {
      console.warn("Error al detener cámara:", e);
    }
  };

  const toggleTorch = async () => {
    try {
      const stream = streamRef.current || (videoRef.current?.srcObject ?? null);
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() || {};
      if (!caps.torch) return;
      const desired = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: desired }] });
      setTorchOn(desired);
    } catch (e) {
      console.warn("Torch no soportado / no se pudo aplicar:", e);
    }
  };

  const changeHwZoom = async (delta) => {
    try {
      const stream = streamRef.current || (videoRef.current?.srcObject ?? null);
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.();
      const settings = track.getSettings?.();
      if (!caps?.zoom) return;
      let z = settings?.zoom ?? caps.zoom.min ?? 1;
      z = Math.min(caps.zoom.max, Math.max(caps.zoom.min, z + delta));
      await track.applyConstraints({ advanced: [{ zoom: z }] });
      setHwZoom(z);
    } catch (e) {
      console.warn("No se pudo ajustar el zoom de hardware:", e);
    }
  };

  // ==== Recorte central para BarcodeDetector ====
  const getCroppedCanvas = () => {
    const video = videoRef.current;
    if (!video) return null;
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return null;

    const dz = Math.max(1.0, parseFloat(digitalZoom) || 1.0);
    if (dz <= 1.01) return video; // sin recorte → detectar sobre el video directo

    const cropW = Math.floor(vw / dz);
    const cropH = Math.floor(vh / dz);
    const sx = Math.floor((vw - cropW) / 2);
    const sy = Math.floor((vh - cropH) / 2);

    const canvas = offCanvasRef.current || (offCanvasRef.current = document.createElement("canvas"));
    // “re-escalo” al tamaño completo para aportar más píxeles al detector
    canvas.width = vw;
    canvas.height = vh;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  // ==== Loop con BarcodeDetector (con zoom digital) ====
  const startDetectorLoop = async () => {
    try {
      if (!("BarcodeDetector" in window)) throw new Error("no-detector");
      detectorRef.current = new window.BarcodeDetector({
        formats: ["ean-13", "ean-8", "code-128"],
      });
      setIsScanning(true);
      loopTimerRef.current = setInterval(async () => {
        try {
          if (!videoRef.current || !detectorRef.current || !isScanning) return;
          const source = getCroppedCanvas(); // video (sin zoom) o canvas (con zoom digital)
          if (!source) return;

          const detections = await detectorRef.current.detect(source);
          const now = Date.now();
          for (const d of detections) {
            const raw = String(d.rawValue || "");
            const digits = normalizeEan(raw);
            if (digits.length < 8 || digits.length > 14) continue;

            const last = lastHitRef.current.get(digits) || 0;
            if (now - last < 800) continue; // debounce
            lastHitRef.current.set(digits, now);

            setScannedMap((prev) => ({ ...prev, [digits]: (prev[digits] || 0) + 1 }));
            beep();
            vibrate(50);
          }
        } catch {}
      }, 200);
    } catch (e) {
      console.warn("BarcodeDetector no disponible o falló. Activando ZXing…", e);
      await startZxing();
    }
  };

  // ==== ZXing (CDN, TRY_HARDER) ====
  const startZxing = async () => {
    try {
      setUsingZxing(true);

      // Si no hay stream aún (p.ej. no pasamos por detector), abrimos cámara
      if (!videoRef.current?.srcObject) {
        await startCamera();
      }

      const { BrowserMultiFormatReader, NotFoundException } = await import(
        "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.4/+esm"
      );
      // Hints extra para mejorar lectura de símbolos chicos
      const { DecodeHintType, BarcodeFormat } = await import(
        "https://cdn.jsdelivr.net/npm/@zxing/library@0.19.2/+esm"
      );

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, 150);
      zxingReaderRef.current = reader;
      setIsScanning(true);

      const controls = await reader.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (result) {
          const text = result.getText();
          const digits = normalizeEan(text);
          if (digits.length >= 8 && digits.length <= 14) {
            const now = Date.now();
            const last = lastHitRef.current.get(digits) || 0;
            if (now - last >= 800) {
              lastHitRef.current.set(digits, now);
              setScannedMap((prev) => ({ ...prev, [digits]: (prev[digits] || 0) + 1 }));
              beep();
              vibrate(50);
            }
          }
        } else if (err && !(err instanceof NotFoundException)) {
          // otros errores transitorios → ignorar
        }
      });

      zxingControlsRef.current = controls;

      // Torch / zoom hardware si el stream lo permite
      try {
        const track = (videoRef.current?.srcObject)?.getVideoTracks?.()[0];
        const caps = track?.getCapabilities?.() || {};
        if (caps.torch) {
          setHasTorch(true);
          setTorchOn(false);
        }
        if (caps.zoom) {
          setHasHwZoom(true);
          setHwZoom(track?.getSettings?.().zoom ?? null);
        }
      } catch {}
    } catch (e) {
      console.error("No se pudo iniciar ZXing:", e);
      toast.error("No se pudo iniciar el lector de códigos (ZXing).");
    }
  };

  const openScanner = async () => {
    setScanOpen(true);
    setScannedMap({});
    lastHitRef.current = new Map();

    if (!window.isSecureContext) {
      toast.info("Sugerencia: usá HTTPS o localhost para mejor compatibilidad del lector.");
    }

    if (detectorSupported) {
      await startCamera();
      await startDetectorLoop();
    } else {
      await startZxing();
    }
  };

  const closeScanner = () => {
    stopCamera();
    setScanOpen(false);
  };

  const pauseResume = async () => {
    if (usingZxing) {
      if (isScanning) {
        try { zxingControlsRef.current?.stop(); } catch {}
        setIsScanning(false);
      } else {
        await startZxing(); // reanuda
      }
    } else {
      setIsScanning((prev) => !prev); // el intervalo respeta isScanning
    }
  };

  const clearScans = () => {
    setScannedMap({});
    lastHitRef.current = new Map();
  };

  // ========== Carga de productos / Stock ==========
  useEffect(() => {
    const cargarProductos = async () => {
      if (!almacenId) return;
      const { data, error } = await supabase
        .from("Stock")
        .select("nombre")
        .eq("almacen_id", almacenId)
        .eq("activo", true);
      if (!error && data) setProductosStock(data.map((p) => p.nombre));
    };
    cargarProductos();
  }, [almacenId]);

  // Cargar info del producto seleccionado por nombre
  useEffect(() => {
    const obtenerStock = async () => {
      setFechasVencimiento([]);
      setFechaSeleccionada("");
      setStockId(null);
      setCantidadDisponible(0);

      if (!nombre || !almacenId) return;

      const { data, error } = await supabase
        .from("Stock")
        .select("id, cantidad, ean")
        .eq("nombre", nombre)
        .eq("almacen_id", almacenId)
        .eq("activo", true)
        .maybeSingle();

      if (!error && data) {
        setStockId(data.id);
        setCantidadDisponible(data.cantidad || 0);
        setEan(data.ean || "");
      }
    };
    obtenerStock();
  }, [nombre, almacenId]);

  // Traer lotes (informativo)
  useEffect(() => {
    const obtenerFechasVencimiento = async () => {
      setFechasVencimiento([]);
      setFechaSeleccionada("");
      if (!stockId) return;

      const { data, error } = await supabase
        .from("Lotes")
        .select("fecha_vencimiento, cantidad")
        .eq("stock_id", stockId)
        .not("fecha_vencimiento", "is", null)
        .gt("cantidad", 0)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

      if (error) return;

      const map = new Map();
      for (const l of data || []) {
        const f = l.fecha_vencimiento;
        map.set(f, (map.get(f) || 0) + (l.cantidad || 0));
      }
      let agrupado = Array.from(map.entries()).map(([fecha, cantidad]) => ({ fecha, cantidad }));
      agrupado.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

      setFechasVencimiento(agrupado);

      if (agrupado.length > 0) {
        const toDate = (s) => new Date(`${s}T00:00:00`);
        const today = new Date(hoyISO() + "T00:00:00");

        const futuros = agrupado.filter((x) => toDate(x.fecha) >= today);
        let elegida;
        if (futuros.length > 0) {
          elegida = futuros.reduce((best, x) => (toDate(x.fecha) < toDate(best.fecha) ? x : best));
        } else {
          elegida = agrupado[agrupado.length - 1];
        }
        setFechaSeleccionada(elegida.fecha);
      }
    };

    obtenerFechasVencimiento();
  }, [stockId]);

  // Lookup por EAN + posible escritura si no tenía
  const handleEanLookup = async () => {
    if (!almacenId) return;
    const clean = normalizeEan(ean);
    setEan(clean);
    if (!clean) return;

    // 1) Buscar por EAN (solo activos)
    const { data: byEan, error: e1 } = await supabase
      .from("Stock")
      .select("id, nombre, cantidad, ean")
      .eq("almacen_id", almacenId)
      .eq("activo", true)
      .eq("ean", clean)
      .maybeSingle();

    if (!e1 && byEan) {
      setNombre(byEan.nombre);
      setStockId(byEan.id);
      setCantidadDisponible(byEan.cantidad || 0);
      return;
    }

    // 2) Si no existe por EAN pero hay nombre seleccionado, y ese producto NO tiene EAN → actualizar
    if (nombre) {
      const { data: byName, error: e2 } = await supabase
        .from("Stock")
        .select("id, ean, cantidad")
        .eq("almacen_id", almacenId)
        .eq("activo", true)
        .eq("nombre", nombre)
        .maybeSingle();

      if (!e2 && byName) {
        if (!byName.ean) {
          const { error: updErr } = await supabase
            .from("Stock")
            .update({ ean: clean })
            .eq("id", byName.id);

          if (!updErr) {
            toast.success("EAN agregado al producto.");
            setStockId(byName.id);
            setCantidadDisponible(byName.cantidad || 0);
          } else {
            toast.error("No se pudo guardar el EAN (posible duplicado en este almacén).");
          }
        } else if (byName.ean !== clean) {
          toast.info("El producto seleccionado ya tenía otro EAN guardado.");
        }
      } else {
        toast.info("No se encontró producto con ese EAN en este almacén.");
      }
    } else {
      toast.info("No se encontró producto con ese EAN en este almacén.");
    }
  };

  // Volcar un EAN escaneado al formulario (busca Stock por EAN)
  const loadScanToForm = async (scannedEan, qty) => {
    try {
      const { data: byEan, error } = await supabase
        .from("Stock")
        .select("id, nombre, cantidad, ean")
        .eq("almacen_id", almacenId)
        .eq("activo", true)
        .eq("ean", scannedEan)
        .maybeSingle();

      setEan(scannedEan);

      if (!error && byEan) {
        setNombre(byEan.nombre);
        setStockId(byEan.id);
        setCantidadDisponible(byEan.cantidad || 0);
        const usable = Math.max(1, Math.min(byEan.cantidad || 0, qty || 1));
        setCantidadVentas(String(usable));
        toast.success(`Cargado ${byEan.nombre} (x${usable})`);
      } else {
        setNombre("");
        setStockId(null);
        setCantidadDisponible(0);
        setCantidadVentas(String(qty || 1));
        toast.info("EAN no encontrado en Stock: completá el producto manualmente.");
      }
      closeScanner();
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar el EAN al formulario.");
    }
  };

  const handleCantidadChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value <= 0) setCantidadVentas("");
    else if (value > cantidadDisponible) setCantidadVentas(cantidadDisponible.toString());
    else setCantidadVentas(value.toString());
  };

  const totalVenta = () => {
    const qty = parseInt(cantidadVentas, 10) || 0;
    const price = parseFloat(precioVenta) || 0;
    return qty * price;
  };

  const guardarVenta = async () => {
    const qty = parseInt(cantidadVentas, 10);
    const price = parseFloat(precioVenta);

    if (!nombre || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
      toast.error("Completá todos los campos correctamente.");
      return;
    }
    if (!almacenId) {
      toast.error("No hay almacén seleccionado.");
      return;
    }
    if (!fechaVenta) {
      toast.error("Seleccioná la fecha de venta.");
      return;
    }
    if (!stockId) {
      toast.error("Producto no encontrado en este almacén.");
      return;
    }

    try {
      // 1) Lotes para FIFO
      const { data: lotes, error: lotesErr } = await supabase
        .from("Lotes")
        .select("id, cantidad, costoUnidad, fecha_vencimiento")
        .eq("stock_id", stockId)
        .gt("cantidad", 0)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

      if (lotesErr) {
        toast.error("No se pudieron obtener los lotes.");
        return;
      }

      const totalEnLotes = (lotes || []).reduce((acc, l) => acc + (l.cantidad || 0), 0);
      if (qty > totalEnLotes) {
        toast.error(`Stock insuficiente por lotes. Disponible: ${totalEnLotes}.`);
        return;
      }

      // 2) Cabecera en Ventas
      const ventaCabecera = {
        nombre,
        cantidad: qty,
        precioVenta: price,
        total: totalVenta(),
        almacen_id: almacenId,
        fecha_venta: fechaVenta,
        formaPago: formaPago || null,
      };

      const { data: ventaIns, error: ventaErr } = await supabase
        .from("Ventas")
        .insert([ventaCabecera])
        .select("id")
        .single();

      if (ventaErr) {
        toast.error("Error al guardar en Ventas.");
        return;
      }

      const ventaId = ventaIns.id;

      // 3) Item
      const ventaItem = {
        venta_id: ventaId,
        stock_id: stockId,
        nombre,
        cantidad: qty,
        precio_unitario: price,
        subtotal: qty * price,
      };
      const { data: viIns, error: viErr } = await supabase
        .from("VentaItems")
        .insert([ventaItem])
        .select("id")
        .single();

      if (viErr) {
        toast.error("Error al guardar los items de la venta.");
        return;
      }
      const ventaItemId = viIns.id;

      // 4) Descontar FIFO + vínculos
      let porVender = qty;
      for (const lote of lotes) {
        if (porVender <= 0) break;
        const tomar = Math.min(porVender, lote.cantidad);

        const vil = {
          venta_item_id: ventaItemId,
          lote_id: lote.id,
          cantidad: tomar,
          costo_unitario: lote.costoUnidad ?? null,
          fecha_vencimiento: lote.fecha_vencimiento ?? null,
        };
        const { error: vilErr } = await supabase.from("VentaItemsLotes").insert([vil]);
        if (vilErr) {
          toast.error("Error al vincular lote en la venta.");
          return;
        }

        const { error: updLoteErr } = await supabase
          .from("Lotes")
          .update({ cantidad: lote.cantidad - tomar })
          .eq("id", lote.id);
        if (updLoteErr) {
          toast.error("Error al actualizar lote.");
          return;
        }

        porVender -= tomar;
      }

      // 5) Actualizar Stock total
      const nuevaCantidad = (cantidadDisponible || 0) - qty;
      const { error: updStockErr } = await supabase
        .from("Stock")
        .update({ cantidad: nuevaCantidad })
        .eq("id", stockId);
      if (updStockErr) {
        toast.error("Error al actualizar stock.");
        return;
      }

      // 6) Limpiar
      setNombre("");
      setEan("");
      setCantidadVentas("");
      setPrecioVenta("");
      setCantidadDisponible(0);
      setFechaVenta(hoyISO());
      setFormaPago("");
      setFechasVencimiento([]);
      setFechaSeleccionada("");
      setStockId(null);

      toast.success("Venta guardada correctamente.");
    } catch (e) {
      console.error(e);
      toast.error("Ocurrió un error inesperado al guardar la venta.");
    }
  };

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-lg mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <Link
          to="/"
          className="inline-block text-sm bg-white text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
        >
          ← Volver al menú
        </Link>

        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-700">Cargar Venta</h1>
          <button
            onClick={openScanner}
            className="text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            title="Escanear códigos con la cámara"
          >
            Escanear códigos
          </button>
        </div>

        <div className="space-y-4">
          {/* EAN (opcional) */}
          <input
            type="text"
            placeholder="EAN (opcional)"
            value={ean}
            onChange={(e) => setEan(e.target.value)}
            onBlur={handleEanLookup}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <input
            list="productos"
            placeholder="Seleccionar o escribir producto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <datalist id="productos">
            {productosStock.map((prod) => (
              <option key={prod} value={prod} />
            ))}
          </datalist>

          {/* Select de fechas de vencimiento (solo si hay) */}
          {fechasVencimiento.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Fechas de vencimiento disponibles
              </label>
              <select
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {fechasVencimiento.map((f) => (
                  <option key={f.fecha} value={f.fecha}>
                    {f.fecha} ({f.cantidad} u)
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                * Informativo. La venta descuenta por orden de vencimiento (FIFO).
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
            <input
              type="number"
              placeholder={`Cantidad (máx ${cantidadDisponible})`}
              value={cantidadVentas}
              onChange={handleCantidadChange}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="number"
              placeholder="Precio de venta por producto"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:space-x-4 sm:space-y-0">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Fecha de venta</label>
              <input
                type="date"
                value={fechaVenta}
                onChange={(e) => setFechaVenta(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Forma de pago</label>
              <select
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Seleccionar...</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Débito">Débito</option>
                <option value="Crédito">Crédito</option>
                <option value="Transferencia bancaria">Transferencia bancaria</option>
                <option value="Mercado Pago">Mercado Pago</option>
                <option value="Cheque">Cheque</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          <div className="text-right text-lg font-semibold text-gray-700">
            Total: ${totalVenta().toFixed(2)}
          </div>
        </div>

        <button
          onClick={guardarVenta}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Guardar Venta
        </button>

        {/* Tabla de escaneos acumulados (si hay) */}
        {Object.keys(scannedMap).length > 0 && (
          <div className="mt-6 border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
              <div className="font-medium text-gray-800">Códigos escaneados</div>
              <div className="flex gap-2">
                <button
                  onClick={clearScans}
                  className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                >
                  Limpiar
                </button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-800">
                    <th className="px-3 py-2">EAN</th>
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(scannedMap).map(([code, qty]) => (
                    <tr key={code} className="border-t">
                      <td className="px-3 py-2 text-gray-800">{code}</td>
                      <td className="px-3 py-2 text-gray-800">{qty}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => loadScanToForm(code, qty)}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          title="Cargar este EAN al formulario"
                        >
                          Usar en formulario
                        </button>
                      </td>
                    </tr>
                  ))}
                  {Object.keys(scannedMap).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                        Sin códigos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal de cámara */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeScanner} />
          <div className="relative bg-white w-[95%] max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-800">
                Escanear códigos {usingZxing ? "(ZXing)" : detectorSupported ? "(nativo)" : ""}
              </div>
              <div className="flex gap-2 items-center">
                {/* Zoom digital (sólo detector nativo) */}
                {!usingZxing && detectorSupported && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-700">Zoom</label>
                    <input
                      type="range"
                      min="1"
                      max="2.2"
                      step="0.1"
                      value={digitalZoom}
                      onChange={(e) => setDigitalZoom(parseFloat(e.target.value))}
                    />
                    <span className="text-xs text-gray-600">{digitalZoom.toFixed(1)}×</span>
                  </div>
                )}
                {/* Zoom hardware */}
                {hasHwZoom && (
                  <>
                    <button
                      onClick={() => changeHwZoom(-0.5)}
                      className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                      title="Zoom − (hardware)"
                    >
                      −
                    </button>
                    <button
                      onClick={() => changeHwZoom(+0.5)}
                      className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                      title="Zoom + (hardware)"
                    >
                      +
                    </button>
                  </>
                )}
                {hasTorch && (
                  <button
                    onClick={toggleTorch}
                    className={`text-xs px-2 py-1 rounded ${
                      torchOn ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                    }`}
                    title="Linterna"
                  >
                    {torchOn ? "Linterna ON" : "Linterna OFF"}
                  </button>
                )}
                <button
                  onClick={pauseResume}
                  className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                >
                  {isScanning ? "Pausar" : "Reanudar"}
                </button>
                <button onClick={closeScanner} className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300">
                  Cerrar
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-3">
              {!window.isSecureContext && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Sugerencia: abrí la app en HTTPS o localhost para máxima compatibilidad.
                </div>
              )}

              <div className="relative rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full h-auto max-h-[55vh] object-contain"
                  playsInline
                  muted
                />
                <div className="pointer-events-none absolute inset-0 border-2 border-emerald-400/60 rounded-lg" />
              </div>

              <div className="text-xs text-gray-600">
                Tip: acercá el código hasta que ocupe ~60–80% del ancho del marco, inclinalo apenas, y subí el zoom si no lo toma.
              </div>

              {/* Resumen live */}
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b text-sm text-gray-700">
                  Detectados ({Object.keys(scannedMap).length})
                </div>
                <div className="max-h-48 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-gray-800">
                        <th className="px-3 py-2">EAN</th>
                        <th className="px-3 py-2">Cant.</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(scannedMap).map(([code, qty]) => (
                        <tr key={code} className="border-t">
                          <td className="px-3 py-2">{code}</td>
                          <td className="px-3 py-2">{qty}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => loadScanToForm(code, qty)}
                              className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              Usar en formulario
                            </button>
                          </td>
                        </tr>
                      ))}
                      {Object.keys(scannedMap).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                            Acercá un código al recuadro para empezar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 bg-gray-50 border-t flex items-center justify-between">
                  <div className="text-xs text-gray-600">
                    Nota: se usa *debounce* por código para evitar duplicados.
                  </div>
                  <button
                    onClick={clearScans}
                    className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
