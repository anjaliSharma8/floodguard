import React, { useState } from 'react';
import { Shelter, Hospital, EmergencyFacility, Language } from '../types';
import { TRANSLATIONS } from '../utils/i18n';
import { 
  PhoneCall, 
  ShieldCheck, 
  Heart, 
  Cross, 
  MapPin, 
  Check, 
  AlertCircle, 
  Filter, 
  PawPrint, 
  Accessibility,
  Flame,
  LifeBuoy
} from 'lucide-react';

interface EmergencyResourcesProps {
  shelters: Shelter[];
  hospitals: Hospital[];
  emergencyFacilities: EmergencyFacility[];
  lang: Language;
}

export const EmergencyResources: React.FC<EmergencyResourcesProps> = ({
  shelters,
  hospitals,
  emergencyFacilities,
  lang
}) => {
  const t = TRANSLATIONS[lang];

  const [shelterFilter, setShelterFilter] = useState<'all' | 'pets' | 'wheelchair'>('all');

  const filteredShelters = shelters.filter(s => {
    if (shelterFilter === 'pets') return s.petFriendly;
    if (shelterFilter === 'wheelchair') return s.wheelchairAccessible;
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-red-600/20 text-red-400 rounded-xl border border-red-500/30">
            <LifeBuoy className="w-5 h-5 text-red-400 animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">{t.emergencySOS}</h2>
            <p className="text-xs text-slate-400">Section 16 Verified Helplines, Animal Rescue & Vulnerable Population Aid</p>
          </div>
        </div>
        <span className="text-xs bg-red-600 text-white font-bold px-3 py-1 rounded-full animate-pulse self-start">
          24x7 Active Dispatch
        </span>
      </div>

      {/* FAST DIAL SOS CARDS */}
      <div>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
          Official Emergency Direct Helplines (Pune & PCMC)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <a
            href="tel:+912025501269"
            className="p-3 bg-red-950/40 hover:bg-red-900/50 border border-red-800/80 rounded-xl flex items-center space-x-3 transition-all group"
          >
            <div className="p-2.5 bg-red-600 rounded-lg text-white group-hover:scale-105 transition-transform">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block">PMC Disaster Control</span>
              <span className="text-xs text-red-300 font-mono font-bold">+91-20-25501269</span>
              <span className="text-[10px] text-slate-400 block">Floods & Evacuations</span>
            </div>
          </a>

          <a
            href="tel:101"
            className="p-3 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/80 rounded-xl flex items-center space-x-3 transition-all group"
          >
            <div className="p-2.5 bg-amber-600 rounded-lg text-white group-hover:scale-105 transition-transform">
              <Flame className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block">Central Fire & Water Rescue</span>
              <span className="text-xs text-amber-300 font-mono font-bold">101 / 020-26451707</span>
              <span className="text-[10px] text-slate-400 block">Inflatable Boats & Tree Fall</span>
            </div>
          </a>

          <a
            href="tel:108"
            className="p-3 bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/80 rounded-xl flex items-center space-x-3 transition-all group"
          >
            <div className="p-2.5 bg-blue-600 rounded-lg text-white group-hover:scale-105 transition-transform">
              <Cross className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block">Emergency Ambulance</span>
              <span className="text-xs text-cyan-300 font-mono font-bold">108 (Toll Free)</span>
              <span className="text-[10px] text-slate-400 block">Trauma & Cardiac Care</span>
            </div>
          </a>

          <a
            href="tel:+919890999111"
            className="p-3 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/80 rounded-xl flex items-center space-x-3 transition-all group"
          >
            <div className="p-2.5 bg-emerald-600 rounded-lg text-white group-hover:scale-105 transition-transform">
              <PawPrint className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block">RESQ Animal Flood Rescue</span>
              <span className="text-xs text-emerald-300 font-mono font-bold">+91-9890999111</span>
              <span className="text-[10px] text-slate-400 block">Wildlife, Pets & Cattle 24x7</span>
            </div>
          </a>

          <a
            href="tel:1070"
            className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center space-x-3 transition-all group"
          >
            <div className="p-2.5 bg-slate-700 rounded-lg text-cyan-400 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block">NDRF 5th Battalion</span>
              <span className="text-xs text-cyan-300 font-mono font-bold">1070 / 020-24328888</span>
              <span className="text-[10px] text-slate-400 block">Deep Submerged Evacuations</span>
            </div>
          </a>

          <a
            href="tel:+912067333333"
            className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center space-x-3 transition-all group"
          >
            <div className="p-2.5 bg-slate-700 rounded-lg text-cyan-400 group-hover:scale-105 transition-transform">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block">PCMC Control Room</span>
              <span className="text-xs text-cyan-300 font-mono font-bold">+91-20-67333333</span>
              <span className="text-[10px] text-slate-400 block">Pimpri, Chinchwad, Bhosari</span>
            </div>
          </a>
        </div>
      </div>

      {/* SECTION 16: VULNERABLE POPULATION & PET SUPPORT PROTOCOLS */}
      <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/80 space-y-2">
        <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Heart className="w-4 h-4 text-pink-400" />
          <span>Vulnerable Population & Animal Evacuation Guidance</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 pt-1">
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <span className="font-bold text-white block mb-1">👶 Children & Seniors</span>
            <p className="text-[11px] text-slate-400">Keep electrolyte sachets, warm clothes, and 3 days of chronic medications in waterproof ziplocs.</p>
          </div>
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <span className="font-bold text-white block mb-1">♿ Persons with Disabilities</span>
            <p className="text-[11px] text-slate-400">Identify step-free shelters (marked with wheelchair badge). Call PMC Disaster cell for assisted stretcher transport.</p>
          </div>
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <span className="font-bold text-white block mb-1">🐾 Domestic Pets & Strays</span>
            <p className="text-[11px] text-slate-400">Never leave dogs tied or birds caged during rising waters. Keep phone tags on collars. Call RESQ for boat animal pickup.</p>
          </div>
        </div>
      </div>

      {/* FLOOD SHELTERS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
            <span>{t.shelters}</span>
          </h3>

          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-400 text-[11px]">Filter:</span>
            <button
              onClick={() => setShelterFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                shelterFilter === 'all' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              All Shelters
            </button>
            <button
              onClick={() => setShelterFilter('pets')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center space-x-1 ${
                shelterFilter === 'pets' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <PawPrint className="w-3 h-3" />
              <span>Pet Friendly</span>
            </button>
            <button
              onClick={() => setShelterFilter('wheelchair')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center space-x-1 ${
                shelterFilter === 'wheelchair' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Accessibility className="w-3 h-3" />
              <span>Wheelchair Accessible</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredShelters.map(shelter => {
            const occPct = Math.round((shelter.currentOccupancy / shelter.capacity) * 100);

            return (
              <div key={shelter.id} className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3.5 text-xs space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{shelter.name}</h4>
                    <p className="text-slate-400 text-[11px]">{shelter.address}</p>
                  </div>
                  <div className="flex space-x-1 shrink-0">
                    {shelter.petFriendly && (
                      <span className="p-1 bg-emerald-500/20 text-emerald-400 rounded" title={t.petFriendlyBadge}>🐾</span>
                    )}
                    {shelter.wheelchairAccessible && (
                      <span className="p-1 bg-blue-500/20 text-blue-400 rounded" title={t.wheelchairBadge}>♿</span>
                    )}
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Capacity: {shelter.currentOccupancy} / {shelter.capacity}</span>
                    <span className="font-bold text-cyan-300">{occPct}% Full</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${occPct > 80 ? 'bg-red-500' : (occPct > 50 ? 'bg-amber-500' : 'bg-emerald-500')}`}
                      style={{ width: `${occPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-700/60 text-[11px]">
                  <span className="text-slate-400">Emergency Desk:</span>
                  <a href={`tel:${shelter.contact}`} className="text-cyan-400 hover:text-cyan-300 font-bold font-mono">
                    {shelter.contact}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* EMERGENCY HOSPITALS */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.hospitals}</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {hospitals.map(hosp => (
            <div key={hosp.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs space-y-1.5">
              <h4 className="font-bold text-white truncate">{hosp.name}</h4>
              <p className="text-[11px] text-slate-400">{hosp.type}</p>
              <div className="flex justify-between text-[11px] text-slate-300 pt-1">
                <span>Total Beds: <strong>{hosp.totalBeds}</strong></span>
                <span className="text-emerald-400 font-semibold">ICU: {hosp.availableIcu} Avail</span>
              </div>
              <div className="pt-1 border-t border-slate-700/60 flex justify-between items-center text-[11px]">
                <span className="text-red-400 font-bold">24x7 Trauma Ready</span>
                <a href={`tel:${hosp.contact}`} className="text-cyan-400 font-mono font-bold">
                  Call Desk
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
