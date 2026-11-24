import logoVuelo from "./logoVuelo.png";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Car,
  Download,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  PhoneCall,
  Power,
  RefreshCcw,
  Share2,
  ShieldCheck,
  Star,
  Upload,
  User,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import "./App.css";

const LOGO = logoVuelo;
const SUPPORT = "soporte@vuelonicaragua.online";
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
const LANDING_URL = "https://vuelonicaragua.online/";

const ACTIVE_RIDE_STATUSES = [
  "confirmed",
  "driver_on_way",
  "driver_arrived",
  "in_progress",
];

const DRIVER_BUSY_STATUSES = [
  "confirmed",
  "driver_on_way",
  "driver_arrived",
  "in_progress",
];

function formatDateTime(value) {
  if (!value) return "Lo antes posible";
  return new Date(value).toLocaleString("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function minutesUntil(value) {
  if (!value) return 0;
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

function isScheduledRide(ride) {
  if (!ride?.requested_departure_at) return false;
  return minutesUntil(ride.requested_departure_at) > 60;
}

function isNearScheduledRide(ride) {
  if (!ride?.requested_departure_at) return true;
  return minutesUntil(ride.requested_departure_at) <= 45;
}

function firstName(name) {
  return name?.trim()?.split(" ")?.[0] || "Pasajero";
}

function statusLabel(status) {
  const labels = {
    searching: "Buscando conductor",
    negotiating: "Negociando",
    confirmed: "Confirmado",
    driver_on_way: "Voy en camino",
    driver_arrived: "Llegué",
    in_progress: "Viaje iniciado",
    completed: "Finalizado",
    cancelled: "Cancelado",
  };
  return labels[status] || status;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [online, setOnline] = useState(false);
  const [driverAccess, setDriverAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");
  const [view, setView] = useState(() => window.location.pathname === "/reset-password" ? "reset" : (sessionStorage.getItem("vuelo-driver-view") || "home"));
  const [toast, setToast] = useState("");
  const [rideAlert, setRideAlert] = useState(null);
  const rideAlertTimer = useRef(null);

  const [switchingMode, setSwitchingMode] = useState(false);
  const [handoffError, setHandoffError] = useState("");
  const [handoffAttempted, setHandoffAttempted] = useState(false);

  useEffect(() => {
    if (view !== "reset") sessionStorage.setItem("vuelo-driver-view", view);
  }, [view]);

  async function switchMode() {
    if (switchingMode) return;
    setSwitchingMode(true);
    setHandoffError("");
    try {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw new Error("Tu sesión venció. Cerrá sesión e ingresá nuevamente.");
      const currentSession = refreshed.session;
      if (!currentSession?.access_token) throw new Error("Iniciá sesión nuevamente.");
      const res = await fetch(import.meta.env.VITE_SUPABASE_URL + "/functions/v1/vuelo-mode-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + currentSession.access_token },
        body: JSON.stringify({ action: "create", destination: "passenger" })
      });
      const payload = await res.json();
      if (!res.ok || !payload.url) throw new Error(payload.error || "No se pudo cambiar de modo.");
      window.location.assign(payload.url);
    } catch (error) {
      setHandoffError(error.message || "No se pudo cambiar de modo.");
      setSwitchingMode(false);
    }
  }

  async function redeemModeHandoff() {
    const query = new URLSearchParams(window.location.search);
    const code = query.get("vuelo_handoff");
    if (!code) return;
    setHandoffAttempted(true);
    window.history.replaceState({}, "", window.location.pathname);
    try {
      const res = await fetch(import.meta.env.VITE_SUPABASE_URL + "/functions/v1/vuelo-mode-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: "redeem", destination: "driver", code })
      });
      const payload = await res.json();
      if (!res.ok || !payload.token_hash) throw new Error(payload.error || "No se pudo recuperar la sesión.");
      const { error } = await supabase.auth.verifyOtp({ token_hash: payload.token_hash, type: "magiclink" });
      if (error) throw error;
      setHandoffError("");
    } catch (error) {
      setHandoffError(error.message || "El cambio de modo falló. Podés iniciar sesión normalmente.");
    }
  }


  useEffect(() => {
    let active = true;
    const startupTimer = window.setTimeout(() => {
      if (!active) return;
      setStartupError("La conexión está tardando más de lo esperado. Revisá tu conexión e intentá nuevamente.");
      setLoading(false);
    }, 15000);

    (async () => {
      await redeemModeHandoff();
      await init();
      if (active) setStartupError("");
    })().catch((error) => {
      if (!active) return;
      console.error("VUELO driver startup error:", error);
      setStartupError(error?.message || "No pudimos iniciar la aplicación.");
      setLoading(false);
    }).finally(() => window.clearTimeout(startupTimer));

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setView("reset");
      if (newSession?.user) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setDriverAccess(null);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      data.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (!profile?.id || driverAccess !== true) return;
    const channel = supabase.channel("driver-global-new-ride-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rides" }, ({ new: ride }) => {
        if (!online || !ride?.id || ride.driver_id || !["searching","negotiating"].includes(ride.status)) return;
        if (ride.requested_at && Date.now() - Date.parse(ride.requested_at) > 10 * 60 * 1000) return;
        setRideAlert({ id: ride.id, pickup: ride.pickup_address, destination: ride.destination_address, price: ride.passenger_offer });
        if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
          const notice = new Notification("Nueva solicitud de viaje", {
            body: (ride.pickup_address || "Origen") + " → " + (ride.destination_address || "Destino"),
            icon: "/icon.svg",
            tag: "vuelo-new-ride-" + ride.id,
          });
          notice.onclick = () => {
            window.focus();
            setView("requests");
            notice.close();
          };
        }
        window.clearTimeout(rideAlertTimer.current);
        rideAlertTimer.current = window.setTimeout(() => setRideAlert(null), 10000);
      }).subscribe();
    return () => { supabase.removeChannel(channel); window.clearTimeout(rideAlertTimer.current); };
  }, [profile?.id, driverAccess, online]);

  async function init() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session);

      const { data: st, error: settingsError } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (settingsError) console.warn("VUELO settings unavailable:", settingsError);
      setSettings(st || null);

      if (data.session?.user) await loadProfile(data.session.user.id);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(id) {
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,email,phone,vuelo_id,rating,city,is_active,role,avatar_url")
      .eq("id", id)
      .single();

    setProfile(data || null);

    const { data: driver } = await supabase
      .from("drivers")
      .select("*")
      .eq("user_id", id)
      .maybeSingle();

    setDriverAccess(driver?.status === "approved");
    setOnline(driver?.status === "approved" && driver?.is_online === true);
  }

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  }

  if (loading) return <Loading />;

  if (startupError) return <div className="center-screen"><div className="blocked-card" style={{maxWidth:440,padding:26,margin:"24px auto",textAlign:"center"}}><img src={LOGO} alt="VUELO" style={{width:92,height:72,objectFit:"contain",margin:"0 auto 12px"}}/><h2>No pudimos cargar VUELO</h2><p role="alert">{startupError}</p><p>Podés volver a intentarlo. Si el problema continúa, contactá a soporte.</p><button type="button" onClick={()=>window.location.reload()}>Reintentar</button><a href={"mailto:"+SUPPORT}>{SUPPORT}</a></div></div>;

  if (view === "reset") return <Reset />;

  if (!session && handoffAttempted && handoffError) return <div className="center-screen"><div className="blocked-card" style={{maxWidth:420,padding:24,margin:"24px auto",textAlign:"center"}}><h2>No se pudo cambiar de modo</h2><p role="alert">{handoffError}</p><p>Tu sesión de la otra aplicación no se ha modificado.</p><button type="button" onClick={() => window.location.assign("https://misviajes.vuelonicaragua.online/")}>Regresar al modo anterior</button><button type="button" onClick={() => {setHandoffAttempted(false);setHandoffError("");}}>Iniciar sesión aquí</button></div></div>;

  if (!session) return <Auth />;

  const isStaff = ["super_admin", "admin", "operations"].includes(profile?.role);
  if (driverAccess !== true && !isStaff) {
    return (
      <Blocked
        title="Acceso de conductor"
        text="No hay un perfil de conductor aprobado para esta cuenta. Podés solicitar tu registro desde VUELO."
      />
    );
  }

  if (profile?.is_active === false) {
    return (
      <Blocked
        title="Cuenta desactivada"
        text="Por seguridad, esta cuenta no puede recibir viajes en este momento."
      />
    );
  }

  return (
    <div className="app">
      {toast && <div className="toast" role="status">✅ {toast}</div>}
      {rideAlert && <div className="global-ride-alert" role="alert">
        <span className="global-ride-alert-icon"><Bell size={20}/></span>
        <div className="global-ride-alert-copy"><strong>¡Nueva solicitud de viaje!</strong><small>{rideAlert.pickup} → {rideAlert.destination}</small><b>C${rideAlert.price}</b></div>
        <button type="button" onClick={() => { setRideAlert(null); setView("requests"); }}>Ver viaje</button>
        <button className="global-ride-alert-close" aria-label="Cerrar aviso" onClick={() => setRideAlert(null)}>×</button>
      </div>}

      <header className="topbar">
        <div className="brand">
          <img src={LOGO} alt="Vuelo" />
          <div>
            <strong>Vuelo</strong>
            <span>Conductor</span>
          </div>
        </div>

        <button className="icon-btn" onClick={() => supabase.auth.signOut()}>
          <LogOut size={19} />
        </button>
      </header>

      <div className="vuelo-mode-switch"><span className="vuelo-mode-current">Modo conductor</span><button className="vuelo-mode-button" type="button" disabled={switchingMode} onClick={switchMode}>{switchingMode ? "Cambiando…" : "Cambiar a pasajero →"}</button>{handoffError && <p className="vuelo-mode-error" role="alert">{handoffError}</p>}</div>
      <PostRideSurvey key={session.user.id} userId={session.user.id} notify={notify} />

      <main>
        <NotificationInbox key={session.user.id} userId={session.user.id} onNavigate={setView} />
        {view === "home" && (
          <Home
            profile={profile}
            settings={settings}
            online={online}
            setOnline={setOnline}
            notify={notify}
          />
        )}

        {view === "requests" && <RideRequests profile={profile} notify={notify} onNavigate={setView} />}
        {view === "active" && <ActiveRide profile={profile} notify={notify} />}
        {view === "earnings" && <Earnings profile={profile} notify={notify} />}
        {view === "profile" && <Profile profile={profile} />}
        <p className="page"><a href="https://vuelonicaragua.online/#privacidad" target="_blank" rel="noreferrer" style={{color:"#067451",textDecoration:"underline"}}>Aviso de privacidad</a></p>
      </main>

      <nav className="bottom-nav" aria-label="Navegación de conductor">
        <button className={view === "home" ? "active" : ""} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>
          <Power size={20} />
          Inicio
        </button>

        <button className={view === "requests" ? "active" : ""} aria-current={view === "requests" ? "page" : undefined} onClick={() => setView("requests")}>
          <MapPin size={20} />
          Viajes
        </button>

        <button className={view === "active" ? "active" : ""} aria-current={view === "active" ? "page" : undefined} onClick={() => setView("active")}>
          <Navigation size={20} />
          Activo
        </button>

        <button className={view === "earnings" ? "active" : ""} aria-current={view === "earnings" ? "page" : undefined} onClick={() => setView("earnings")}>
          <Wallet size={20} />
          Historial
        </button>

        <button className={view === "profile" ? "active" : ""} aria-current={view === "profile" ? "page" : undefined} onClick={() => setView("profile")}>
          <User size={20} />
          Perfil
        </button>
      </nav>
    </div>
  );
}

function RideChat({ rideId, userId }) {
  const [messages,setMessages]=useState([]);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [readError,setReadError]=useState(false);
  const [sendError,setSendError]=useState("");
  const pending=React.useRef(null);

  useEffect(()=>{
    let active=true;
    let version=0;
    async function load() {
      const current=++version;
      const {data,error}=await supabase.from("ride_messages")
        .select("id,sender_id,message,created_at").eq("ride_id",rideId)
        .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(50);
      if (!active || current!==version) return;
      setReadError(Boolean(error));
      if (!error) setMessages((data||[]).reverse());
    }
    const channel=supabase.channel("ride-chat:"+rideId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"ride_messages",filter:"ride_id=eq."+rideId},load)
      .subscribe((status)=>{if(status==="SUBSCRIBED") void load();});
    const timer=window.setInterval(()=>{if(!document.hidden) void load();},6000);
    void load();
    return ()=>{
      active=false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  },[rideId]);

  async function send(event) {
    event.preventDefault();
    const message=draft.trim();
    if (!message || sending) return;
    if (pending.current?.message!==message) pending.current={message,id:crypto.randomUUID()};
    setSending(true);
    setSendError("");
    try {
      const {error}=await supabase.rpc("vuelo_send_ride_message",{p_ride:rideId,p_message:message,p_id:pending.current.id});
      if (error) {
        setSendError(error.message);
        return;
      }
      const id=pending.current.id;
      setMessages((previous)=>previous.some((item)=>item.id===id)?previous:[...previous,{id,message,sender_id:userId}]);
      pending.current=null;
      setDraft("");
    } catch {
      setSendError("No se pudo confirmar el envío. Podés volver a intentarlo.");
    } finally {
      setSending(false);
    }
  }

  return <section className="rating-box" aria-label="Chat del viaje">
    <h3>Chat del viaje</h3>
    {readError && <p role="status">No pudimos actualizar el chat.</p>}
    {messages.length===0 && !readError && <p>Usá este chat para coordinar la recogida.</p>}
    {messages.length>0 && <ul role="log" aria-label="Mensajes" style={{listStyle:"none",padding:0,maxHeight:260,overflowY:"auto"}}>
      {messages.map((item)=><li key={item.id} style={{background:item.sender_id===userId?"#dff5ec":"#fff",borderRadius:12,padding:10,marginBottom:6,overflowWrap:"anywhere",whiteSpace:"pre-wrap"}}>
        <strong>{item.sender_id===userId?"Vos":"Pasajero"}</strong>
        <div>{item.message}</div>
      </li>)}
    </ul>}
    <form onSubmit={send}>
      <div className="row-actions">
        {["Voy en camino","No encuentro la dirección","Estoy en el punto"].map((message)=><button key={message} type="button" disabled={sending}
          onClick={()=>setDraft(message)} style={{margin:3,padding:8,borderRadius:10,border:"1px solid #a9d4c3",background:"#fff",color:"#067451"}}>{message}</button>)}
      </div>
      <textarea aria-label="Mensaje del viaje" placeholder="Escribí un mensaje" maxLength={500}
        value={draft} onChange={(event)=>setDraft(event.target.value)} disabled={sending} />
      {sendError && <p role="alert">{sendError}</p>}
      <button type="submit" className="send-rating-btn" disabled={sending || !draft.trim()}>
        {sending?"Enviando…":"Enviar mensaje"}
      </button>
    </form>
  </section>;
}

function NotificationInbox({userId,onNavigate}) {
  const [items,setItems]=useState([]);
  const [errorText,setErrorText]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    let request=0;
    async function refresh() {
      const current=++request;
      const {data,error}=await supabase.from("vuelo_notifications")
        .select("id,kind,title,body,read_at,created_at,ride_id").eq("recipient",userId)
        .order("id",{ascending:false}).limit(20);
      if (!active || current!==request) return;
      if (error) setErrorText("No se pudieron actualizar los avisos.");
      else {setErrorText("");setItems(data||[]);}
      setLoading(false);
    }
    const channel=supabase.channel("vuelo-inbox:"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"vuelo_notifications",filter:"recipient=eq."+userId},refresh)
      .subscribe((status)=>{if(status==="SUBSCRIBED") void refresh();});
    const timer=window.setInterval(()=>{if(!document.hidden) void refresh();},15000);
    document.addEventListener("visibilitychange",refresh);
    void refresh();
    return ()=>{
      active=false;window.clearInterval(timer);
      document.removeEventListener("visibilitychange",refresh);
      void supabase.removeChannel(channel);
    };
  },[userId]);

  async function open(item) {
    const destinations={request:"requests",confirmed:"active",chat:"active",completed:"earnings",cancelled:"requests"};
    if (!item.read_at) {
      const read_at=new Date().toISOString();
      const {error}=await supabase.from("vuelo_notifications").update({read_at}).eq("id",item.id);
      if (error) {setErrorText("No se pudo marcar el aviso como leído. Volvé a intentarlo.");return;}
      setItems(previous=>previous.map(entry=>entry.id===item.id?{...entry,read_at}:entry));
    }
    const destination=destinations[item.kind];
    if(destination) onNavigate(destination);
  }

  const unread=items.filter(item=>!item.read_at);
  return <section className="page notification-panel" aria-label="Centro de notificaciones">
    <details className="notification-drawer">
      <summary className="notification-summary">
        <span className="notification-summary-main"><strong>Notificaciones</strong><small>{loading?"Actualizando avisos":unread.length?unread.length+" sin leer":"Estás al día"}</small></span>
        <span className="notification-count" aria-label={unread.length+" notificaciones sin leer"}>{unread.length || ""}</span>
        <span className="notification-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="notification-content" aria-live="polite">
        {errorText && <p className="notification-error" role="alert">{errorText}</p>}
        {loading && !items.length && <p className="notification-empty">Cargando notificaciones…</p>}
        {!loading && !items.length && !errorText && <p className="notification-empty">Todavía no tenés avisos. Te mostraremos aquí las novedades de tus viajes.</p>}
        {items.map(item=><article className={"notification-item"+(!item.read_at?" is-unread":"")} key={item.id}>
          <span className={"notification-dot "+(item.read_at?"is-read":"")} aria-hidden="true"/>
          <div className="notification-item-copy">
            <div className="notification-item-heading"><strong>{item.title}</strong>{!item.read_at&&<span className="notification-new">Nuevo</span>}</div>
            <p>{item.body}</p>
            <small>{item.created_at?new Date(item.created_at).toLocaleString("es-NI",{dateStyle:"short",timeStyle:"short"}):""}</small>
          </div>
          {(destinations[item.kind]||(!item.read_at&&item.kind==="admin"))&&<button className="notification-action" type="button" onClick={()=>open(item)}>
            {destinations[item.kind]?(item.kind==="request"?"Ver solicitud":item.kind==="chat"?"Abrir chat":item.kind==="completed"?"Ver historial":"Ver viaje"):"Marcar leído"}
          </button>}
        </article>)}
      </div>
    </details>
  </section>;
}
function PostRideSurvey({ userId, notify }) {
  const [tripId, setTripId] = useState(null);
  const dismissed = React.useRef(new Set());
  const dialog = React.useRef(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let active = true;
    let loading = false;
    let refreshQueued = false;

    async function refresh() {
      if (!active || document.hidden) return;
      if (loading) {
        refreshQueued = true;
        return;
      }
      loading = true;
      try {
        const { data: driver, error: driverError } = await supabase.from("drivers")
          .select("id").eq("user_id", userId).maybeSingle();
        if (driverError || !driver) return;
        const ownerId = driver.id;
        const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: trips, error } = await supabase.from("rides").select("id")
          .eq("driver_id", ownerId)
          .eq("status", "completed")
          .not("passenger_id", "is", null)
          .gte("completed_at", recent).order("completed_at", { ascending: false }).limit(10);
        if (error || !trips?.length || !active) return;
        const { data: ratings, error: ratingsError } = await supabase.from("passenger_ratings")
          .select("ride_id").eq("driver_id", ownerId)
          .in("ride_id", trips.map(({ id }) => id));
        if (!active || ratingsError) return;
        const rated = new Set(ratings.map(({ ride_id }) => ride_id));
        const pending = trips.find(({ id }) => !rated.has(id) && !dismissed.current.has(id));
        if (pending) setTripId((current) => current || pending.id);
      } finally {
        loading = false;
        if (refreshQueued) {
          refreshQueued = false;
          void refresh();
        }
      }
    }

    const channel = supabase.channel("post-ride-survey:" + userId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides" }, ({ new: row }) => {
        if (row.status === "completed") void refresh();
      }).subscribe();
    const timer = window.setInterval(refresh, 12000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("vuelo-trip-completed", refresh);
    void refresh();

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("vuelo-trip-completed", refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (tripId && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [tripId]);

  function close() {
    dismissed.current.add(tripId);
    setTripId(null);
    setStars(0);
    setComment("");
    setErrorText("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!stars || sending) return;
    setSending(true);
    setErrorText("");
    try {
      const { error } = await supabase.rpc("vuelo_review_ride", {
        p_ride: tripId, p_rating: stars, p_comment: comment, p_as_driver: true,
      });
      if (error) {
        setErrorText("No pudimos guardar la reseña. Volvé a intentarlo.");
        return;
      }
      close();
      notify("Reseña guardada.");
    } finally {
      setSending(false);
    }
  }

  if (!tripId) return null;

  return (
    <dialog ref={dialog} className="rating-box" aria-labelledby="post-ride-title"
      onCancel={(event) => { event.preventDefault(); if (!sending) close(); }}
      style={{ width: "min(420px, calc(100% - 24px))", maxHeight: "85dvh", margin: "auto", padding: 20, border: "1px solid #cbd5e1" }}>
      <form onSubmit={submit}>
        <h2 id="post-ride-title">Calificá al pasajero</h2>
        <p>¿Cómo fue tu experiencia?</p>
        <div className="rating-stars" role="group" aria-label="Calificación de 1 a 5 estrellas">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" aria-label={value + (value === 1 ? " estrella" : " estrellas")}
              aria-pressed={stars === value} className={stars >= value ? "star-selected" : ""}
              disabled={sending} onClick={() => setStars(value)}>
              <Star size={17} fill={stars >= value ? "currentColor" : "none"} aria-hidden="true" />
              {value}
            </button>
          ))}
        </div>
        <textarea aria-label="Comentario opcional" placeholder="Comentario opcional"
          maxLength={500} value={comment} disabled={sending} onChange={(event) => setComment(event.target.value)} />
        {errorText && <p role="alert">{errorText}</p>}
        <button type="submit" className="send-rating-btn" disabled={!stars || sending}>
          {sending ? "Guardando…" : "Enviar reseña"}
        </button>
        <button type="button" className="send-rating-btn" disabled={sending} onClick={close}
          style={{ background: "#fff", color: "#067451", border: "1px solid #cbd5e1" }}>Más tarde</button>
      </form>
    </dialog>
  );
}

function Loading() {
  return (
    <div className="center">
      <RefreshCcw className="spin" />
      <p>Cargando Vuelo Conductor...</p>
    </div>
  );
}

function Blocked({ title, text }) {
  const driverApproval = title === "Acceso de conductor";
  return (
    <div className="center">
      <div className="auth-card center-card">
        <img src={LOGO} alt="Vuelo" />
        <h1>{title}</h1>
        <p>{text}</p>
        {driverApproval && (
          <a className="primary-btn" href={LANDING_URL} target="_blank" rel="noreferrer">
            Solicitar aprobación como conductor
          </a>
        )}
        <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
        <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
    </div>
  );
}

function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [recovery, setRecovery] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setMsg("");

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(
        recovery.trim().toLowerCase(),
        { redirectTo: `${APP_URL}/reset-password` }
      );

      setMsg(
        error
          ? error.message
          : "Si existe una cuenta asociada a este correo, te enviaremos instrucciones."
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) setMsg(error.message);
    }

    setSending(false);
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <img src={LOGO} alt="Vuelo" />

        <h1>{mode === "forgot" ? "Recuperar contraseña" : "Vuelo Conductor"}</h1>

        <p>
          {mode === "forgot"
            ? "Escribe tu correo para restablecer tu contraseña."
            : "Ingresa con las credenciales enviadas por Vuelo."}
        </p>

        {msg && <div className="message">{msg}</div>}

        {mode === "forgot" ? (
          <>
            <label>Correo electrónico</label>
            <input
              type="email"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              required
            />

            <div className="support-note">
              ¿No tienes acceso a tu correo? Escríbenos a{" "}
              <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.
            </div>
          </>
        ) : (
          <>
            <label>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}

        <button disabled={sending}>
          {sending ? "Procesando..." : mode === "forgot" ? "Enviar correo" : "Ingresar"}
        </button>

        {mode !== "forgot" ? (
          <button type="button" className="link-btn" onClick={() => setMode("forgot")}>
            ¿Olvidaste tu contraseña?
          </button>
        ) : (
          <button type="button" className="link-btn" onClick={() => setMode("login")}>
            Volver a iniciar sesión
          </button>
        )}
      </form>
    </div>
  );
}

function Reset() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();

    if (password.length < 6) {
      setMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== password2) {
      setMsg("Las contraseñas no coinciden.");
      return;
    }

    setSending(true);

    const { error } = await supabase.auth.updateUser({ password });

    setMsg(error ? error.message : "Contraseña actualizada. Ya puedes iniciar sesión.");

    if (!error) {
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.history.replaceState({}, "", "/");
        window.location.reload();
      }, 1800);
    }

    setSending(false);
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <img src={LOGO} alt="Vuelo" />
        <h1>Nueva contraseña</h1>

        {msg && <div className="message">{msg}</div>}

        <label>Nueva contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <label>Confirmar contraseña</label>
        <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />

        <button disabled={sending}>{sending ? "Actualizando..." : "Actualizar contraseña"}</button>
      </form>
    </div>
  );
}

function Home({ profile, settings, online, setOnline, notify }) {
  const first = profile?.full_name?.split(" ")[0] || "Conductor";
  const [scheduled, setScheduled] = useState([]);
  const [browserPermission, setBrowserPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) {
      setBrowserPermission("unsupported");
      notify("Este navegador no admite avisos de escritorio.");
      return;
    }
    if (Notification.permission === "granted") {
      setBrowserPermission("granted");
      notify("Los avisos de este navegador ya están activados.");
      return;
    }
    if (Notification.permission === "denied") {
      setBrowserPermission("denied");
      notify("Los avisos están bloqueados en el navegador. Habilítalos desde los permisos del sitio.");
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
    notify(permission === "granted"
      ? "Avisos del navegador activados mientras VUELO esté abierto."
      : "No se concedió permiso para mostrar avisos.");
  }

  useEffect(() => {
    loadScheduledTrips();
  }, []);

  async function loadScheduledTrips() {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!driver?.id) return;

    const { data } = await supabase
      .from("rides")
      .select("id,pickup_address,destination_address,requested_departure_at,status,final_price")
      .eq("driver_id", driver.id)
      .in("status", ["confirmed", "driver_on_way", "driver_arrived", "in_progress"])
      .order("requested_departure_at", { ascending: true });

    setScheduled((data || []).filter((ride) => isScheduledRide(ride)));
  }

  async function shareLanding() {
    const shareData = {
      title: "Vuelo Nicaragua",
      text: "Conocé VUELO y descubrí cómo unirte a nuestra comunidad de conductores en Ometepe.",
      url: LANDING_URL,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(LANDING_URL);
    notify("Enlace de la landing copiado.");
  }

  async function toggle() {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!driver?.id) {
      notify("Tu perfil de conductor aún no está activo. Contacta a soporte.");
      setOnline(false);
      return;
    }

    const { data: nearTrip } = await supabase
      .from("rides")
      .select("id,requested_departure_at,status")
      .eq("driver_id", driver.id)
      .in("status", DRIVER_BUSY_STATUSES)
      .order("requested_departure_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const shouldBlock = nearTrip && isNearScheduledRide(nearTrip);
    const next = shouldBlock ? false : !online;

    if (shouldBlock && !online) {
      notify("Tienes un viaje activo o próximo. No puedes ponerte disponible en este momento.");
      return;
    }

    setOnline(next);

    const { error } = await supabase.rpc("vuelo_set_driver_availability", {
      p_online: next,
    });

    if (error) {
      notify(error.message);
      setOnline(!next);
      return;
    }

    notify(next ? "Ahora estás disponible." : "Te desconectaste.");
  }

  return (
    <section className="page">
      <div className="welcome-card">
        <span>Hola {first}</span>
        <h1>{online ? "Estás disponible" : "Conéctate para recibir viajes"}</h1>
        <p>
          {profile?.vuelo_id || "DRV-000000"} · ⭐ {profile?.rating || "5.00"} · Ometepe
        </p>

        <button onClick={toggle} className={online ? "danger-btn" : ""}>
          <Power size={18} />
          {online ? "Desconectarme" : "Conectarme"}
        </button>
        <button type="button" className="browser-notification-btn" onClick={enableBrowserNotifications}
          disabled={browserPermission === "unsupported" || browserPermission === "granted"}>
          <Bell size={17} />
          {browserPermission === "granted" ? "Avisos del navegador activados" : browserPermission === "denied" ? "Permitir avisos en el navegador" : "Activar avisos del navegador"}
        </button>
        <small className="browser-notification-note">Avisos de nuevas solicitudes cuando VUELO esté abierto en este navegador.</small>
      </div>

      <InstallReminder notify={notify} />

      <div className="emergency-card">
        <h3>Emergencias y reportes</h3>
        <p>
          Para reportes de la app escribe a <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.
          En una emergencia llama directamente a las autoridades.
        </p>
        <div className="emergency-actions">
          <a href="tel:118"><PhoneCall size={18} /> Policía Nacional 118</a>
          <a href="tel:115"><PhoneCall size={18} /> Bomberos 115</a>
        </div>
      </div>

      <div className="share-card">
        <div>
          <h3>Comparte Vuelo con otros conductores</h3>
          <p>Envía el enlace de la landing para que otros conductores conozcan el proyecto.</p>
        </div>
        <button onClick={shareLanding}><Share2 size={18} /> Compartir landing</button>
      </div>

      <div className="safety-card">
        <h3>Nota importante para conductores</h3>
        <p>
          Prioriza viajes cercanos, respeta las normas de tránsito y conduce de forma responsable. El uso de alcohol o sustancias al volante podrá ser reportado a las autoridades.
        </p>
      </div>

      <div className="scheduled-card">
        <h3>Viajes programados</h3>
        {scheduled.length > 0 ? (
          scheduled.map((ride) => (
            <div className="scheduled-item" key={ride.id}>
              <strong>{ride.pickup_address} → {ride.destination_address}</strong>
              <span>Salida: {formatDateTime(ride.requested_departure_at)}</span>
              <span>Bloqueo automático: 45 minutos antes de la salida.</span>
            </div>
          ))
        ) : (
          <p>No tienes viajes programados por ahora.</p>
        )}
      </div>

      <div className="commission-card">
        <ShieldCheck />
        <div>
          <h2>0% de comisión en lanzamiento</h2>
          <p>
            {settings?.driver_message ||
              "Actualmente Vuelo no cobra comisiones a los conductores para que puedan ofertar tarifas ajustadas."}
          </p>
        </div>
      </div>

      <div className="quick-grid">
        <InfoCard icon={<Car />} title="Solicitudes" text="Recibe viajes de usuarios cercanos." />
        <InfoCard icon={<Wallet />} title="Negociación" text="Acepta o envía contraofertas." />
        <InfoCard icon={<MessageCircle />} title="Cliente" text="Verás nombre, ID y detalles del pasajero." />
        <InfoCard icon={<MapPin />} title="Programados" text="Los viajes futuros no te bloquean hasta 45 min antes." />
      </div>
    </section>
  );
}

function InstallReminder({ notify }) {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    const dismissed = Number(localStorage.getItem("vuelo_driver_install_dismissed") || 0);
    const recent = dismissed && Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000;

    setIos(/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()));

    if (!standalone && !recent) setShow(true);

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);

      if (!standalone && !recent) setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (prompt) {
      prompt.prompt();

      const choice = await prompt.userChoice;

      if (choice.outcome === "accepted") {
        setShow(false);
        notify("Vuelo Conductor se está instalando.");
      }

      setPrompt(null);
      return;
    }

    notify(
      ios
        ? "En iPhone: toca Compartir y luego Agregar a pantalla de inicio."
        : "Abre el menú del navegador y toca Agregar a pantalla de inicio."
    );
  }

  function dismiss() {
    localStorage.setItem("vuelo_driver_install_dismissed", String(Date.now()));
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="install-card">
      <button className="install-close" onClick={dismiss}>
        <X size={16} />
      </button>

      <div className="install-icon">
        <Download size={24} />
      </div>

      <div>
        <h3>Instala Vuelo Conductor</h3>
        <p>
          Agrega la app a tu pantalla de inicio para recibir solicitudes más rápido.
        </p>

        {ios && (
          <small>
            En iPhone: toca <Share2 size={13} /> Compartir → Agregar a pantalla de inicio.
          </small>
        )}

        <div className="install-actions">
          <button onClick={install}>Instalar ahora</button>
          <button className="later" onClick={dismiss}>Más tarde</button>
        </div>
      </div>
    </div>
  );
}

function RideRequests({ profile, notify, onNavigate }) {
  const [rides, setRides] = useState([]);
  const [amount, setAmount] = useState({});
  const [eta, setEta] = useState({});
  const [msg, setMsg] = useState({});
  const [driverId, setDriverId] = useState(null);
  const [activeRide, setActiveRide] = useState(null);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("driver-rides")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_offers" }, load)
      .subscribe();

    const refreshTimer = window.setInterval(load, 12000);
    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  async function getDriver() {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id,status,is_available,is_online")
      .eq("user_id", profile.id)
      .eq("status", "approved")
      .maybeSingle();

    setDriverId(driver?.id || null);
    return driver;
  }

  async function load() {
    const driver = await getDriver();

    if (driver?.id) {
      const { data: busy } = await supabase
        .from("rides")
        .select("*")
        .eq("driver_id", driver.id)
        .in("status", ACTIVE_RIDE_STATUSES)
        .order("requested_departure_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      setActiveRide(busy || null);
    }

    if (!driver?.id) {
      setRides([]);
      return;
    }

    const { data, error } = await supabase.rpc("vuelo_open_ride_requests");
    if (!error) setRides(data || []);
  }

  function canOfferRide(ride) {
    if (!activeRide) return true;
    if (isScheduledRide(activeRide) && !isNearScheduledRide(activeRide)) return true;
    return false;
  }

  async function offer(ride) {
    const offerAmount = Number(amount[ride.id] || ride.passenger_offer);
    const estimatedTime = Number(eta[ride.id] || 10);

    if (!Number.isFinite(offerAmount) || offerAmount <= 0 || !Number.isInteger(estimatedTime) || estimatedTime <= 0) {
      notify("Ingresa una oferta válida.");
      return;
    }

    const driver = await getDriver();

    if (!driver?.id) {
      notify("Tu perfil de conductor aún no está aprobado. Contacta a soporte.");
      return;
    }

    if (!canOfferRide(ride)) {
      notify("Ya tienes un viaje activo o próximo. Finalízalo antes de tomar otro.");
      return;
    }

    const { data: previousOffers } = await supabase
      .from("ride_offers")
      .select("id,status,expires_at")
      .eq("ride_id", ride.id)
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false });

    const acceptedOffer = (previousOffers || []).find((item) => item.status === "accepted");
    const pendingOffers = (previousOffers || []).filter((item) => item.status === "pending" && (!item.expires_at || Date.parse(item.expires_at) > Date.now()));

    if (acceptedOffer) {
      notify("Tu oferta ya fue aceptada para este viaje.");
      return;
    }

    if (pendingOffers.length >= 2) {
      notify("Ya enviaste 2 ofertas para este viaje. Solo podrás enviar otra si el pasajero rechaza una.");
      return;
    }

    const { error } = await supabase.from("ride_offers").insert([
      {
        ride_id: ride.id,
        driver_id: driver.id,
        amount: offerAmount,
        estimated_arrival_minutes: estimatedTime,
        message: msg[ride.id] || "Estoy disponible para realizar el viaje.",
        status: "pending",
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    notify(pendingOffers.length === 1 ? "Segunda oferta enviada al pasajero." : "Oferta enviada al pasajero.");

    setAmount({ ...amount, [ride.id]: "" });
    setEta({ ...eta, [ride.id]: "" });
    setMsg({ ...msg, [ride.id]: "" });
    load();
  }

  return (
    <section className="page">
      <div className="section-title">
        <h1>Solicitudes disponibles</h1>
        <p>
          Puedes enviar ofertas a viajes inmediatos o programados. Si tienes un viaje programado, solo se bloqueará tu disponibilidad 45 minutos antes de la salida.
        </p>
      </div>

      <button className="refresh-btn" onClick={load}>
        <RefreshCcw size={18} />
        Actualizar
      </button>

      {activeRide && !canOfferRide(activeRide) && (
        <div className="warning-card">
          <Navigation />
          <div>
            <h3>Viaje activo o próximo</h3>
            <p>No puedes tomar nuevos viajes mientras este viaje esté activo o próximo a salir.</p>
          </div>
        </div>
      )}

      {rides.length === 0 && (
        <div className="empty-card">
          <MapPin size={36} />
          <h2>No hay solicitudes activas</h2>
          <p>Cuando un pasajero solicite viaje, aparecerá aquí.</p>
        </div>
      )}

      <div className="requests-list">
        {rides.map((ride) => (
          <div className="request-card" key={ride.id}>
            <span>{isScheduledRide(ride) ? "Viaje programado" : "Nuevo viaje"}</span>
            <h2>
              {ride.pickup_address} → {ride.destination_address}
            </h2>
            <p>La dirección exacta se muestra cuando el pasajero confirma.</p>

            <div className="mini-grid">
              <div>
                <strong>C${ride.passenger_offer}</strong>
                <small>Oferta pasajero</small>
              </div>

              <div>
                <strong>{ride.vehicle_type_requested === "motorcycle" ? "Moto" : "Vehículo"}</strong>
                <small>Tipo</small>
              </div>

              <div>
                <strong>{formatDateTime(ride.requested_departure_at)}</strong>
                <small>Salida</small>
              </div>

              <div>
                <strong>{ride.passenger_count || (ride.vehicle_type_requested === "motorcycle" ? "1" : "No indicado")}</strong>
                <small>Personas</small>
              </div>

              <div>
                <strong>{ride.status ? statusLabel(ride.status) : "Disponible"}</strong>
                <small>Estado</small>
              </div>
            </div>

            <label>Tu oferta C$</label>
            <input
              type="number"
              placeholder={`Ej: ${ride.passenger_offer}`}
              value={amount[ride.id] || ""}
              onChange={(e) => setAmount({ ...amount, [ride.id]: e.target.value })}
            />

            <label>Tiempo aproximado para llegar</label>
            <select
              value={eta[ride.id] || ""}
              onChange={(e) => setEta({ ...eta, [ride.id]: e.target.value })}
            >
              <option value="">Seleccionar</option>
              <option value="10">10 minutos</option>
              <option value="25">25 minutos</option>
              <option value="40">40 minutos</option>
              <option value="60">60 minutos</option>
              <option value="70">70 minutos</option>
            </select>

            <label>Mensaje opcional</label>
            <textarea
              placeholder="Ej: puedo llegar en 25 minutos."
              value={msg[ride.id] || ""}
              onChange={(e) => setMsg({ ...msg, [ride.id]: e.target.value })}
            />

            <button onClick={() => offer(ride)}>{amount[ride.id] && Number(amount[ride.id]) !== Number(ride.passenger_offer) ? "Enviar contraoferta" : "Ofrecer la tarifa del pasajero"}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActiveRide({ profile, notify }) {
  const [ride, setRide] = useState(null);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("driver-active-ride")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, load)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function load() {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!driver?.id) {
      setRide(null);
      return;
    }

    const { data } = await supabase
      .from("rides")
      .select(`
        *,
        passenger:passenger_public_profiles!rides_passenger_public_profile_fkey(
          user_id,
          display_name,
          vuelo_id,
          rating,
          avatar_url
        )
      `)
      .eq("driver_id", driver.id)
      .in("status", ACTIVE_RIDE_STATUSES)
      .order("requested_departure_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    setRide(data || null);
  }

  async function status(nextStatus) {
    const { error } = await supabase.rpc("vuelo_advance_ride", {
      p_ride_id: ride.id,
      p_expected: ride.status,
      p_next: nextStatus,
    });

    if (error) {
      alert(error.message);
      return;
    }

    if (nextStatus === "completed") {
      window.dispatchEvent(new Event("vuelo-trip-completed"));
      const { error: availabilityError } = await supabase.rpc("vuelo_set_driver_availability", {
        p_online: true,
      });
      if (availabilityError) {
        notify("El viaje terminó, pero no pudimos reconectar tu disponibilidad. Revisá tu estado.");
      }
    }

    notify(statusLabel(nextStatus));
    load();
  }

  const [sharingRideId, setSharingRideId] = useState(null);
  const rideId = ride?.id;
  const sharing = Boolean(rideId && rideId === sharingRideId);

  useEffect(() => {
    if (!sharing) return;
    let active = true;
    let sending = false;
    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition(async ({ coords }) => {
      if (!active || document.hidden || sending || Date.now() - lastSent < 8000) return;
      sending = true;
      const { error } = await supabase.rpc("vuelo_share_driver_location", {
        p_ride: rideId,
        p_lat: coords.latitude,
        p_lng: coords.longitude,
      });
      sending = false;
      if (!active) return;
      if (error) {
        notify("No se pudo compartir la ubicación. Volvé a intentarlo.");
        setSharingRideId(null);
      } else {
        lastSent = Date.now();
      }
    }, (error) => {
      if (!active) return;
      notify(error.code === 1 ? "Activá el permiso de ubicación para compartir tu GPS." : "No se pudo obtener el GPS. Volvé a intentarlo.");
      setSharingRideId(null);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
    };
  }, [sharing, rideId]);

  function toggleLocation() {
    if (!navigator.geolocation) {
      notify("GPS no disponible.");
      return;
    }
    setSharingRideId(sharing ? null : rideId);
  }

  const nextStep = {
    confirmed: { key: "driver_on_way", label: "Voy en camino" },
    driver_on_way: { key: "driver_arrived", label: "Llegué" },
    driver_arrived: { key: "in_progress", label: "Iniciar viaje" },
    in_progress: { key: "completed", label: "Finalizar viaje" },
  }[ride?.status];

  return (
    <section className="page">
      <div className="section-title">
        <h1>Viaje activo</h1>
        <p>Actualiza el estado y comparte ubicación.</p>
      </div>

      {!ride ? (
        <div className="empty-card">
          <Navigation size={36} />
          <h2>No tienes viaje activo</h2>
          <p>Cuando un pasajero confirme, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="active-ride-card">
          <span>{isScheduledRide(ride) ? "Viaje programado" : "Viaje confirmado"}</span>
          <h2>
            {ride.pickup_address} → {ride.destination_address}
          </h2>

          <div className="passenger-detail-card">
            {ride.passenger?.avatar_url ? (
              <img src={ride.passenger.avatar_url} alt="Pasajero" />
            ) : (
              <div>{firstName(ride.passenger?.display_name)[0]}</div>
            )}
            <section>
              <h3>{firstName(ride.passenger?.display_name)}</h3>
              <p>{ride.passenger?.vuelo_id || "PAS-000000"} · ⭐ {ride.passenger?.rating || "5.00"}</p>
              <p>Comunicación mediante el chat de VUELO</p>
            </section>
          </div>

          <p>Precio acordado: C${ride.final_price || ride.passenger_offer}</p>
          <p>Salida: <strong>{formatDateTime(ride.requested_departure_at)}</strong></p>
          {ride.pickup_lat && ride.pickup_lng && (
  <a
    className="maps-btn"
    href={`https://www.google.com/maps?q=${ride.pickup_lat},${ride.pickup_lng}`}
    target="_blank"
    rel="noreferrer"
  >
    📍 Abrir punto de recogida en Google Maps
  </a>
)}
          {ride.destination_lat != null && ride.destination_lng != null && (
            <a className="maps-btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ride.destination_lat + "," + ride.destination_lng)}`}
              target="_blank" rel="noreferrer">
              Abrir punto B en Google Maps
            </a>
          )}
          {ride.destination_reference && <p>Referencia destino: <strong>{ride.destination_reference}</strong></p>}
          {ride.passenger_count && <p>Personas en vehículo: <strong>{ride.passenger_count}</strong></p>}
          {ride.passenger_notes && <p>Notas del pasajero: <strong>{ride.passenger_notes}</strong></p>}
          <p>Estado actual: <strong>{statusLabel(ride.status)}</strong></p>

          {nextStep && (
            <div className="status-flow">
              <button type="button" className={nextStep.key === "completed" ? "status-finish" : "status-next"} onClick={() => status(nextStep.key)}>
                {nextStep.label}
              </button>
            </div>
          )}

          <RideChat key={ride.id} rideId={ride.id} userId={profile.id} />

          <button className="dark-btn full-btn" type="button" onClick={toggleLocation}>
            {sharing ? "Dejar de compartir ubicación" : "Compartir ubicación en vivo"}
          </button>
          <p>Al compartir, el pasajero de este viaje verá tu última ubicación. Podés detener el envío en cualquier momento.</p>
          {sharing && <p role="status">GPS activo mientras mantenés esta pantalla abierta.</p>}
        </div>
      )}
    </section>
  );
}

function Earnings({ profile, notify }) {
  const [rides, setRides] = useState([]);
  const [ratingDrafts, setRatingDrafts] = useState({});
  const [ratingStars, setRatingStars] = useState({});
  const [submittedRatings, setSubmittedRatings] = useState({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!driver?.id) {
      setRides([]);
      return;
    }

    const { data } = await supabase
      .from("rides")
      .select(`
        *,
        passenger:passenger_public_profiles!rides_passenger_public_profile_fkey(
          user_id,
          display_name,
          vuelo_id,
          rating,
          avatar_url
        )
      `)
      .eq("driver_id", driver.id)
      .eq("status", "completed")
      .order("requested_at", { ascending: false })
      .limit(100);

    setRides(data || []);

    const rideIds = (data || []).map((ride) => ride.id);

    if (rideIds.length) {
      const { data: ratingData } = await supabase
        .from("passenger_ratings")
        .select("ride_id,rating,comment")
        .in("ride_id", rideIds);

      const submittedMap = {};
      const starsMap = {};
      const draftMap = {};

      (ratingData || []).forEach((rating) => {
        submittedMap[rating.ride_id] = true;
        starsMap[rating.ride_id] = rating.rating;
        draftMap[rating.ride_id] = rating.comment || "";
      });

      setSubmittedRatings(submittedMap);
      setRatingStars((prev) => ({ ...prev, ...starsMap }));
      setRatingDrafts((prev) => ({ ...prev, ...draftMap }));
    }
  }

  function setDraft(rideId, value) {
    if (submittedRatings[rideId]) return;
    setRatingDrafts((prev) => ({ ...prev, [rideId]: value }));
  }

  function selectStars(rideId, stars) {
    if (submittedRatings[rideId]) return;
    setRatingStars((prev) => ({ ...prev, [rideId]: stars }));
  }

  async function submitPassengerRating(ride) {
    if (submittedRatings[ride.id]) return;
    const stars = ratingStars[ride.id];
    if (!stars) {
      notify("Seleccioná de 1 a 5 estrellas.");
      return;
    }

    const { data: savedStars, error } = await supabase.rpc("vuelo_review_ride", {
      p_ride: ride.id,
      p_rating: stars,
      p_comment: ratingDrafts[ride.id] || null,
      p_as_driver: true,
    });
    if (error) {
      notify(error.message);
      return;
    }

    setRatingStars((prev) => ({ ...prev, [ride.id]: savedStars }));
    setSubmittedRatings((prev) => ({ ...prev, [ride.id]: true }));
    notify("Reseña guardada.");
  }

  const total = rides.reduce(
    (sum, ride) => sum + Number(ride.final_price || ride.passenger_offer || 0),
    0
  );

  return (
    <section className="page">
      <div className="section-title">
        <h1>Historial y ganancias</h1>
        <p>Resumen estimado y viajes finalizados.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <strong>C${total.toFixed(2)}</strong>
          <span>Ingresos</span>
        </div>

        <div className="stat-card">
          <strong>C$0.00</strong>
          <span>Comisión actual</span>
        </div>

        <div className="stat-card">
          <strong>C${(total * 0.1).toFixed(2)}</strong>
          <span>Comisión teórica</span>
        </div>
      </div>

      <div className="history-list">
        {rides.map((ride) => (
          <div className="history-item-card" key={ride.id}>
            <strong>
              {ride.pickup_address} → {ride.destination_address}
            </strong>
            <span>{formatDateTime(ride.requested_at)}</span>
            <b>C${ride.final_price || ride.passenger_offer}</b>

            <div className="passenger-mini-card">
              {ride.passenger?.avatar_url ? (
                <img src={ride.passenger.avatar_url} alt="Pasajero" />
              ) : (
                <div>{firstName(ride.passenger?.display_name)[0]}</div>
              )}
              <section>
                <strong>{firstName(ride.passenger?.display_name)}</strong>
                <small>{ride.passenger?.vuelo_id || "PAS-000000"} · ⭐ {ride.passenger?.rating || "5.00"}</small>
              </section>
            </div>

            <div className="rating-box">
              <label>{submittedRatings[ride.id] ? "Pasajero calificado" : "Calificar pasajero"}</label>
              <div className="rating-stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={(ratingStars[ride.id] || 0) >= star ? "star-selected" : ""}
                    onClick={() => selectStars(ride.id, star)}
                    disabled={submittedRatings[ride.id]}
                  >
                    <Star size={20} fill={(ratingStars[ride.id] || 0) >= star ? "currentColor" : "none"} /> {star}
                  </button>
                ))}
              </div>

              {!submittedRatings[ride.id] && (
                <>
                  <textarea
                    placeholder="Comentario opcional sobre el pasajero..."
                    maxLength={500}
                    aria-label="Comentario opcional"
                    value={ratingDrafts[ride.id] || ""}
                    onChange={(e) => setDraft(ride.id, e.target.value)}
                  />
                  <button className="send-rating-btn" type="button" onClick={() => submitPassengerRating(ride)}>
                    Enviar calificación
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function Profile({ profile }) {
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMsg("Selecciona una imagen válida.");
      return;
    }

    if (file.size > 1024 * 1024) {
      setMsg("La imagen debe pesar máximo 1 MB.");
      return;
    }

    setUploading(true);
    setMsg("");

    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${profile.id}/driver-avatar-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setMsg("Foto de perfil actualizada correctamente.");
    } catch (error) {
      setMsg(error.message || "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="page">
      <div className="profile-card">
        {avatarUrl ? (
          <img className="profile-photo" src={avatarUrl} alt="Foto de perfil" />
        ) : (
          <div className="avatar">{profile?.full_name?.[0] || "V"}</div>
        )}

        <h1>{profile?.full_name || "Conductor Vuelo"}</h1>
        <p>{profile?.email}</p>
        <p>{profile?.phone || "WhatsApp no registrado"}</p>

        <label className="upload-avatar-btn">
          <Upload size={18} />
          {uploading ? "Subiendo foto..." : "Cambiar foto de perfil"}
          <input type="file" accept="image/*" onChange={uploadAvatar} disabled={uploading} />
        </label>

        {msg && <div className="message profile-message">{msg}</div>}

        <div className="profile-grid">
          <div>
            <strong>{profile?.vuelo_id || "DRV-000000"}</strong>
            <span>ID Vuelo</span>
          </div>

          <div>
            <strong>{profile?.rating || "5.00"}</strong>
            <span>Calificación</span>
          </div>

          <div>
            <strong>{profile?.city || "Ometepe"}</strong>
            <span>Ciudad</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ icon, title, text }) {
  return (
    <div className="info-card">
      <div>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
