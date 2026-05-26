import { describe, it, expect } from 'vitest';
import { mapSpreadsheetToOtifRecords } from '@/lib/otifRecordMapper';
import { resolveDefaultColumn } from '@/lib/columnMapping';

describe('OTIF Ingestion & Status Resolution Test', () => {
  it('should resolve status using combined_otif and prioritize it over probabilities', () => {
    const table = {
      columnKeys: ['sales_order', 'combined_otif', 'prob_hit', 'prob_miss'],
      columnLabels: ['Sales Order', 'Combined OTIF', 'Prob Hit', 'Prob Miss'],
      rows: [
        ['10001', 'Miss', '80', '20'], // combined_otif says Miss, but probs say Hit
        ['10002', 'Hit', '10', '90'],  // combined_otif says Hit, but probs say Miss
        ['10003', '', '30', '70'],     // combined_otif is empty, fallback to probs (Miss)
        ['10004', '0', '', ''],        // combined_otif says 0 (Miss), no probs
      ],
    };

    const records = mapSpreadsheetToOtifRecords(table);
    expect(records).toHaveLength(4);
    
    // Row 1: combined_otif = Miss overrides probs
    expect(records[0].status).toBe('Miss');
    
    // Row 2: combined_otif = Hit overrides probs
    expect(records[1].status).toBe('Hit');

    // Row 3: empty combined_otif, falls back to probs (prob_hit = 30 < prob_miss = 70 => Miss)
    expect(records[2].status).toBe('Miss');

    // Row 4: combined_otif = '0' => Miss
    expect(records[3].status).toBe('Miss');
  });

  it('should resolve status column header when it is combined_otif', () => {
    const headers = ['sales_order', 'combined_otif', 'prob_miss'];
    const resolved = resolveDefaultColumn('status', headers);
    expect(resolved).toBe('combined_otif');
  });
});
