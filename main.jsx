import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("VUELO render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24,background:"#f4f8f5",fontFamily:"system-ui,sans-serif",color:"#17372a"}}>
        <section style={{width:"min(100%,440px)",padding:28,borderRadius:22,background:"#fff",boxShadow:"0 12px 36px rgba(0,0,0,.08)",textAlign:"center"}}>
          <h1 style={{marginTop:0}}>VUELO Conductor</h1>
          <h2>No pudimos mostrar esta pantalla</h2>
          <p>Ocurrió un error al cargar la aplicación. Recargá la página para intentarlo nuevamente.</p>
          <button onClick={()=>window.location.reload()} style={{minHeight:46,padding:"10px 20px",border:0,borderRadius:12,background:"#0b6848",color:"#fff",fontWeight:700,cursor:"pointer"}}>Recargar aplicación</button>
          <p><a href="mailto:soporte@vuelonicaragua.online" style={{color:"#0b6848"}}>Contactar soporte</a></p>
        </section>
      </main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
