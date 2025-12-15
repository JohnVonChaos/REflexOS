export enum ColorId {
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  RED = 'RED',
  YELLOW = 'YELLOW',
  VIOLET = 'VIOLET',
  BROWN = 'BROWN',
  BLACK = 'BLACK',
  GREY = 'GREY'
}

export interface TracePoint {
  x: number;
  y: number;
  t: number;
}

export interface PathData {
  color: ColorId;
  points: TracePoint[];
}

export interface MotionStats {
  paths: PathData[];
  durations: Record<ColorId, number>;
  errors: { color: ColorId; dropsOutsideTarget: number }[];
}

export interface VerificationPayload {
  sequence: ColorId[];
  trace: MotionStats;
}

export interface JellybeanHumanCheckProps {
  onVerified: (payload: VerificationPayload) => void;
  onCancel?: () => void;
}
