const App = () => {
  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-primary">LogisCore ERP</h1>
      <p className="text-slate-600">Infraestructura inicializada correctamente ✅</p>
      <div className="flex gap-2">
        <button className="btn btn-primary">Botón Primario</button>
        <button className="btn btn-secondary">Botón Secundario</button>
      </div>
      <div className="card max-w-md w-full text-center">
        <p className="text-sm text-slate-500">Toda la arquitectura base está lista para implementar el MVP.</p>
      </div>
    </div>
  );
};

export default App;