import { describe, expect, it } from 'vitest';
import { parseBankSms, parseVnd } from '../supabase/functions/_shared/smsParser.ts';
import { categorize, TRANSFER_CATEGORY } from '../supabase/functions/_shared/categorize.ts';

// NOTE: these are ASSUMED formats. Replace/extend them with real SMS
// (account numbers masked) from your phone — see README "Thêm mẫu SMS thật".
const received = new Date('2026-10-29T03:00:00Z');

describe('parseVnd', () => {
  it('handles both separators and decimal tails', () => {
    expect(parseVnd('1,234,567')).toBe(1234567);
    expect(parseVnd('1.234.567')).toBe(1234567);
    expect(parseVnd('50,000.00')).toBe(50000);
    expect(parseVnd('65000')).toBe(65000);
  });
});

describe('BIDV', () => {
  it('parses a debit with ND', () => {
    const r = parseBankSms(
      'TK 12010000xxx789 tai BIDV -150,000VND vao 12:30 28/10/2026. So du:5,200,000VND. ND: GRAB*A-7XYZ thanh toan',
      'BIDV',
      received,
    );
    expect(r).toEqual({
      bank: 'BIDV',
      account: '12010000xxx789',
      amount: -150000,
      balance: 5200000,
      occurredAt: '2026-10-28T05:30:00.000Z',
      description: 'GRAB*A-7XYZ thanh toan',
    });
  });

  it('parses a credit', () => {
    const r = parseBankSms(
      'TK 12010000xxx789 tai BIDV +10,000,000VND vao 09:00 05/10/2026. So du:15,200,000VND. ND: CONG TY ABC TRA LUONG T9',
      'BIDV',
      received,
    );
    expect(r?.amount).toBe(10000000);
    expect(r?.description).toBe('CONG TY ABC TRA LUONG T9');
    expect(categorize(r!.description, r!.amount)).toBe('Lương');
  });

  it('handles accented text', () => {
    const r = parseBankSms('TK 1201xxx789 tại BIDV -45.000VND vào 07:05 29/10/2026. Số dư: 1.000.000VND. ND: Phúc Long', 'BIDV');
    expect(r?.amount).toBe(-45000);
    expect(r?.balance).toBe(1000000);
    expect(categorize(r!.description, r!.amount)).toBe('Ăn uống');
  });
});

describe('Techcombank', () => {
  it('parses a multi-line SMS without ND label', () => {
    const r = parseBankSms(
      'TK 19036xxxxx012\nSo tien GD:-65,000\nSo du:2,345,000\nHIGHLANDS COFFEE NGUYEN HUE\n29/10/26 08:15',
      'Techcombank',
      received,
    );
    expect(r).toMatchObject({
      bank: 'TCB',
      account: '19036xxxxx012',
      amount: -65000,
      balance: 2345000,
      occurredAt: '2026-10-29T01:15:00.000Z',
      description: 'HIGHLANDS COFFEE NGUYEN HUE',
    });
  });

  it('parses an incoming transfer with ND label', () => {
    const r = parseBankSms(
      'Techcombank: TK 19036xxxxx012\nSo tien GD:+500,000\nSo du:2,845,000\n29/10/26 10:00\nND: NGUYEN VAN A chuyen tien',
      'Techcombank',
      received,
    );
    expect(r?.amount).toBe(500000);
    expect(r?.description).toBe('NGUYEN VAN A chuyen tien');
  });
});

describe('Viettel Money', () => {
  it('parses a real SMS (ISO date, dotted account mask)', () => {
    const r = parseBankSms(
      'TK ViettelPay 9704...9946 GD -10.000 VND luc 2026-10-29 10:04:09 So du 6.617.834 VND ND: GD chuyen tien 261029538796265 696885 NGUYEN TRONG TU chuyen tien tu ViettelMoney',
      undefined,
      received,
    );
    expect(r).toEqual({
      bank: 'VIETTELPAY',
      account: '9704...9946',
      amount: -10000,
      balance: 6617834,
      occurredAt: '2026-10-29T03:04:09.000Z',
      description: 'GD chuyen tien 261029538796265 696885 NGUYEN TRONG TU chuyen tien tu ViettelMoney',
    });
  });

  it('keeps a bank SMS that only mentions ViettelMoney in its content as that bank', () => {
    const r = parseBankSms('TK 1201xxx789 tai BIDV +50,000VND vao 09:00 29/10/2026. So du:1,000,000VND. ND: nhan tu ViettelMoney');
    expect(r?.bank).toBe('BIDV');
  });
});

describe('fallbacks', () => {
  it('returns null for non-transaction SMS (e.g. OTP)', () => {
    expect(parseBankSms('Ma OTP cua quy khach la 123456. Khong chia se ma nay.', 'BIDV')).toBeNull();
  });

  it('uses receivedAt when the SMS has no date', () => {
    const r = parseBankSms('TK 1201xxx789 -20,000VND. ND: test', 'BIDV', received);
    expect(r?.occurredAt).toBe(received.toISOString());
  });
});

describe('categorize', () => {
  it('prefers user rules and longer patterns', () => {
    expect(categorize('SHOPEEFOOD don 123', -50000)).toBe('Ăn uống');
    expect(categorize('SHOPEE don 123', -50000)).toBe('Mua sắm');
    expect(categorize('NGUYEN VAN B', -1000000, [{ pattern: 'nguyen van b', category: 'Nhà ở' }])).toBe('Nhà ở');
  });

  it('does not put expenses into income categories', () => {
    expect(categorize('tra luong nhan vien', -5000000)).toBe('Khác');
  });

  it('applies internal transfer rules both ways', () => {
    const rules = [{ pattern: 'chuyen sang tcb', category: TRANSFER_CATEGORY }];
    expect(categorize('chuyen sang TCB', -1000000, rules)).toBe(TRANSFER_CATEGORY);
  });
});
