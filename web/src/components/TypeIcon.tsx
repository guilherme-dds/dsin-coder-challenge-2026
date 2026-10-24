import {
  Bike,
  Bot,
  Bus,
  Cctv,
  Construction,
  Motorbike,
  ParkingMeter,
  Radar,
  Scale,
  Shield,
  ShieldUser,
  Siren,
  TrafficCone,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  RADAR: Radar,
  CAMERA: Cctv,
  BALANCA: Scale,
  VEICULO_FISCALIZACAO_ESTACIONAMENTO: Bot,
  CANCELA: Construction,
  VEICULO_TRANSPORTE: Bus,
  TOTEM_ESTACIONAMENTO: ParkingMeter,
  PATINETE: Bike,
  MOTO_AGENTE: Motorbike,
  VIATURA: Siren,
  // Agentes (pelo código da função)
  AGENTE_TRANSITO: TrafficCone,
  GUARDA_MUNICIPAL: Shield,
  POLICIAL_MILITAR: ShieldUser,
};

/** Ícone do tipo de equipamento ou função do agente; tipos novos caem no ícone genérico. */
export function TypeIcon({ code, size = 18 }: { code: string; size?: number }) {
  const Icon = ICONS[code] ?? Wrench;
  return <Icon size={size} strokeWidth={1.8} />;
}
