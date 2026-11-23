import logoVuelo from "./logoVuelo.png";
import React, { useEffect, useMemo, useState } from "react";
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
const LANDING_URL = "https://vuelonicaragua.online";

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
  const [notif, setNotif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(
    window.location.pathname === "/reset-password" ? "reset" : "home"
  );
  const [toast, setToast] = useState("");

  useEffect(() => {
    init();

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === "PASSWORD_RECOVERY") setView("reset");

      if (newSession?.user) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function init() {
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    setSession(data.session);

    const { data: st } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    setSettings(st || null);

    if (data.session?.user) {
      await loadProfile(data.session.user.id);
    }

    setNotif("Notification" in window && Notification.permission === "granted");
    setLoading(false);
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

    setOnline(driver?.is_online === true);
  }

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  }

  if (loading) return <Loading />;

  if (view === "reset") return <Reset />;

  if (!session) return <Auth />;

  if (!["driver", "super_admin", "admin", "operations"].includes(profile?.role)) {
    return (
      <Blocked
        title="Acceso de conductor"
        text="Esta aplicación es solo para conductores aprobados por Vuelo."
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

      <header className="topbar">
        <div className="brand">
          <img src={LOGO} alt="Vuelo" />
          <div>
            <strong>Vuelo</strong>
            <span>Driver</span>
          </div>
        </div>

        <button className="icon-btn" onClick={() => supabase.auth.signOut()}>
          <LogOut size={19} />
        </button>
      </header>

      <main>
        {view === "home" && (
          <Home
            profile={profile}
            settings={settings}
            online={online}
            setOnline={setOnline}
            notif={notif}
            setNotif={setNotif}
            notify={notify}
          />
        )}

        {view === "requests" && <RideRequests profile={profile} notify={notify} />}
        {view === "active" && <ActiveRide profile={profile} notify={notify} />}
        {view === "earnings" && <Earnings profile={profile} notify={notify} />}
        {view === "profile" && <Profile profile={profile} />}
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
          Finanzas
        </button>

        <button className={view === "profile" ? "active" : ""} aria-current={view === "profile" ? "page" : undefined} onClick={() => setView("profile")}>
          <User size={20} />
          Perfil
        </button>
      </nav>
    </div>
  );
}

function Loading() {
  return (
    <div className="center">
      <RefreshCcw className="spin" />
      <p>Cargando Vuelo Driver...</p>
    </div>
  );
}

function Blocked({ title, text }) {
  return (
    <div className="center">
      <div className="auth-card center-card">
        <img src={LOGO} alt="Vuelo" />
        <h1>{title}</h1>
        <p>{text}</p>
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

        <h1>{mode === "forgot" ? "Recuperar contraseña" : "Vuelo Driver"}</h1>

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

function Home({ profile, settings, online, setOnline, notif, setNotif, notify }) {
  const first = profile?.full_name?.split(" ")[0] || "Conductor";
  const [scheduled, setScheduled] = useState([]);

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
      text: "Únete a Vuelo como conductor o conoce más sobre la plataforma.",
      url: LANDING_URL,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(LANDING_URL);
    notify("Enlace de la landing copiado.");
  }

  async function reqNotif() {
    if (!("Notification" in window)) {
      notify("Este navegador no permite notificaciones.");
      return false;
    }

    const permission = await Notification.requestPermission();
    const ok = permission === "granted";

    setNotif(ok);
    notify(ok ? "Notificaciones activadas." : "Debes activar notificaciones para recibir viajes.");

    return ok;
  }

  async function toggle() {
    if (!online && !notif) {
      const ok = await reqNotif();
      if (!ok) return;
    }

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

    const { error } = await supabase
      .from("drivers")
      .update({
        is_online: next,
        is_available: next,
      })
      .eq("id", driver.id);

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

      {!notif && (
        <div className="warning-card">
          <Bell />
          <div>
            <h3>Notificaciones Push</h3>
            <p>
              Aún estamos preparando las notificaciones push reales. Por ahora, mantén la app abierta para ver solicitudes y cambios en tiempo real.
            </p>
            <button onClick={reqNotif}>Activar permiso de notificaciones</button>
          </div>
        </div>
      )}

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
        notify("Vuelo Driver se está instalando.");
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
        <h3>Instala Vuelo Driver</h3>
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

function RideRequests({ profile, notify }) {
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

    return () => supabase.removeChannel(channel);
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

    const { data } = await supabase
      .from("rides")
      .select(`
        *,
        passenger:profiles!rides_passenger_id_fkey(
          id,
          full_name,
          vuelo_id,
          phone,
          rating,
          city,
          avatar_url
        )
      `)
      .eq("status", "searching")
      .order("requested_departure_at", { ascending: true })
      .limit(50);

    setRides(data || []);
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
{ride.pickup_lat && ride.pickup_lng && (
  <a
    className="maps-btn"
    href={`https://www.google.com/maps?q=${ride.pickup_lat},${ride.pickup_lng}`}
    target="_blank"
    rel="noreferrer"
  >
    📍 Ver punto GPS en Google Maps
  </a>
)}
            <div className="passenger-mini-card">
              {ride.passenger?.avatar_url ? (
                <img src={ride.passenger.avatar_url} alt="Pasajero" />
              ) : (
                <div>{firstName(ride.passenger?.full_name)[0]}</div>
              )}
              <section>
                <strong>{firstName(ride.passenger?.full_name)}</strong>
                <small>{ride.passenger?.vuelo_id || "PAS-000000"} · ⭐ {ride.passenger?.rating || "5.00"}</small>
                <small>{ride.passenger?.phone || "WhatsApp no registrado"}</small>
              </section>
            </div>

            <p>{ride.passenger_notes || "Sin notas adicionales."}</p>

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
                <strong>{ride.destination_reference || "No indicada"}</strong>
                <small>Referencia destino</small>
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
        passenger:profiles!rides_passenger_id_fkey(
          id,
          full_name,
          vuelo_id,
          phone,
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
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (driver?.id) {
        await supabase
          .from("drivers")
          .update({ is_available: true, is_online: true })
          .eq("id", driver.id);
      }
    }

    notify(statusLabel(nextStatus));
    load();
  }

  async function loc() {
    if (!navigator.geolocation) {
      notify("GPS no disponible.");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (!driver?.id) {
        notify("Tu perfil de conductor aún no está activo.");
        return;
      }

      const { error } = await supabase.from("driver_locations").insert([
        {
          driver_id: driver.id,
          ride_id: ride?.id || null,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
      ]);

      if (error) {
        notify(error.message);
        return;
      }

      notify("Ubicación compartida.");
    });
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
              <div>{firstName(ride.passenger?.full_name)[0]}</div>
            )}
            <section>
              <h3>{firstName(ride.passenger?.full_name)}</h3>
              <p>{ride.passenger?.vuelo_id || "PAS-000000"} · ⭐ {ride.passenger?.rating || "5.00"}</p>
              <p>{ride.passenger?.phone || "WhatsApp no registrado"}</p>
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

          <button className="dark-btn full-btn" onClick={loc}>
            Compartir ubicación
          </button>
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
        passenger:profiles!rides_passenger_id_fkey(
          id,
          full_name,
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
      notify("Selecciona una calificación de 1 a 5 estrellas.");
      return;
    }

    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!driver?.id) {
      notify("No se encontró tu perfil de conductor.");
      return;
    }

    const { error } = await supabase.from("passenger_ratings").insert([
      {
        ride_id: ride.id,
        driver_id: driver.id,
        passenger_id: ride.passenger_id,
        rating: stars,
        comment: ratingDrafts[ride.id] || null,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    setSubmittedRatings((prev) => ({ ...prev, [ride.id]: true }));
    notify("Calificación enviada.");
  }

  const total = rides.reduce(
    (sum, ride) => sum + Number(ride.final_price || ride.passenger_offer || 0),
    0
  );

  return (
    <section className="page">
      <div className="section-title">
        <h1>Finanzas</h1>
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
                <div>{firstName(ride.passenger?.full_name)[0]}</div>
              )}
              <section>
                <strong>{firstName(ride.passenger?.full_name)}</strong>
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
