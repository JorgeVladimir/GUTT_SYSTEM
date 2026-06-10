import React, { useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';

// Fix para iconos de Leaflet en React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapSelectorProps {
  onLocationSelect: (lat: string, lng: string, address: string, image: string) => void;
  onClose: () => void;
  initialPosition?: { lat: number; lng: number };
  title?: string;
}

function MapClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  onLocationSelect,
  onClose,
  initialPosition = { lat: -1.5923, lng: -78.9044 }, // Ecuador default
  title = 'Seleccionar Ubicación'
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [address, setAddress] = useState('');
  const mapRef = useRef<L.Map>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleLocationSelect = (lat: number, lng: number) => {
    setPosition({ lat, lng });
    // Reverse geocoding simulado - en producción usar una API real
    setAddress(`Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`);
  };

  const handleCapture = async () => {
    if (!mapRef.current) return;
    
    setIsCapturing(true);
    try {
      const canvas = await html2canvas(mapRef.current.getContainer(), {
        useCORS: true,
        allowTaint: true,
        scale: 2
      });
      
      const imageData = canvas.toDataURL('image/png');
      onLocationSelect(
        position.lat.toString(),
        position.lng.toString(),
        address,
        imageData
      );
      onClose();
    } catch (error) {
      console.error('Error capturando mapa:', error);
      alert('Error al capturar el mapa. Por favor intente nuevamente.');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        <div className="p-6 bg-[#14532D] text-white flex justify-between items-center shrink-0">
          <h4 className="font-black uppercase text-xs tracking-widest flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {title}
          </h4>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 bg-slate-50 shrink-0">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            Haga clic en el mapa para seleccionar la ubicación
          </p>
          <div className="flex gap-4">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección (se actualiza al hacer clic en el mapa)"
              className="flex-1 px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-sm focus:border-[#14532D] outline-none"
            />
            <button
              onClick={handleCapture}
              disabled={isCapturing}
              className="px-6 py-3 bg-[#14532D] text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-[#1b5e20] transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isCapturing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Capturando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Capturar Ubicación
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <MapContainer
            center={position}
            zoom={13}
            style={{ height: '100%', minHeight: '400px' }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={position} />
            <MapClickHandler onLocationSelect={handleLocationSelect} />
          </MapContainer>
        </div>

        <div className="p-4 bg-slate-50 border-t shrink-0">
          <p className="text-[9px] font-bold text-slate-400 text-center">
            Coordenadas seleccionadas: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </p>
        </div>
      </div>
    </div>
  );
};
