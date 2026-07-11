export type EquipmentType = 'diesel_genset' | 'irrigation_pump' | 'unknown';

export interface SymptomInput {
  equipmentType: EquipmentType;
  symptomRaw: string;
  photoUri?: string;
  audioUri?: string;
  capturedAt: string;
}

export const emptySymptom = (equipmentType: EquipmentType = 'unknown'): SymptomInput => ({
  equipmentType,
  symptomRaw: '',
  capturedAt: new Date().toISOString(),
});
