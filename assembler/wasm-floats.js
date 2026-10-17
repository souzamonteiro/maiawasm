'use strict';

function format(width) {
  if (width === 32) return { fraction: 23, exponent: 8, bias: 127 };
  if (width === 64) return { fraction: 52, exponent: 11, bias: 1023 };
  throw new Error(`Unsupported float width ${width}`);
}

function readBits(bytes, offset, width) {
  format(width);
  if (!Number.isInteger(offset) || offset < 0 || offset + width / 8 > bytes.length) {
    throw new Error(`f${width} read out of bounds at offset ${offset}`);
  }
  let bits = 0n;
  for (let i = width / 8 - 1; i >= 0; i--) bits = (bits << 8n) | BigInt(bytes[offset + i]);
  return bits;
}

function quoteWatFloat(bytes, offset, width) {
  const { fraction, exponent, bias } = format(width);
  const bits = readBits(bytes, offset, width);
  const sign = bits >> BigInt(width - 1) ? '-' : '';
  const mask = (1n << BigInt(fraction)) - 1n;
  const payload = bits & mask;
  const exp = Number((bits >> BigInt(fraction)) & ((1n << BigInt(exponent)) - 1n));
  if (exp === 2 ** exponent - 1) return `${sign}${payload ? `nan:0x${payload.toString(16)}` : 'inf'}`;
  if (exp === 0 && payload === 0n) return `${sign}0x0p+0`;
  const significand = exp === 0 ? payload : (1n << BigInt(fraction)) | payload;
  const power = (exp || 1) - bias - fraction;
  return `${sign}0x${significand.toString(16)}p${power >= 0 ? '+' : ''}${power}`;
}

function roundRatio(numerator, denominator) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twice = remainder * 2n;
  return quotient + (twice > denominator || (twice === denominator && (quotient & 1n)) ? 1n : 0n);
}

function encodeWatFloat(text, width) {
  const { fraction, exponent, bias } = format(width);
  if (typeof text !== 'string') throw new Error(`Missing f${width} literal`);
  const negative = text[0] === '-';
  const magnitude = /^[+-]/.test(text) ? text.slice(1) : text;
  const sign = negative ? 1n << BigInt(width - 1) : 0n;
  const allExponents = ((1n << BigInt(exponent)) - 1n) << BigInt(fraction);
  let bits;
  if (magnitude === 'inf') {
    bits = allExponents;
  } else if (magnitude === 'nan' || /^nan:0x[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/.test(magnitude)) {
    const payload = magnitude === 'nan' ? 1n << BigInt(fraction - 1) : BigInt(magnitude.slice(4).replace(/_/g, ''));
    if (payload === 0n || payload >= 1n << BigInt(fraction)) throw new Error(`Invalid f${width} NaN payload: ${text}`);
    bits = allExponents | payload;
  } else {
    const decimalDigits = '[0-9]+(?:_[0-9]+)*';
    const hexDigits = '[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*';
    const decimal = new RegExp(`^(${decimalDigits})(?:\\.(${decimalDigits})?)?(?:[eE]([+-]?${decimalDigits}))?$`).exec(magnitude);
    const hex = new RegExp(`^0x(${hexDigits})(?:\\.(${hexDigits})?)?(?:[pP]([+-]?${decimalDigits}))?$`).exec(magnitude);
    const match = hex || decimal;
    if (!match) throw new Error(`Invalid f${width} literal: ${text}`);
    const whole = match[1].replace(/_/g, '');
    const tail = (match[2] || '').replace(/_/g, '');
    const digits = (whole + tail).replace(/^0+/, '');
    let numerator = digits ? BigInt(`${hex ? '0x' : ''}${digits}`) : 0n;
    let denominator = 1n;
    const power = BigInt((match[3] || '0').replace(/_/g, '')) - BigInt(tail.length * (hex ? 4 : 1));
    const order = power + BigInt(digits.length * (hex ? 4 : 1));
    if (numerator !== 0n && order > (hex ? 1100n : 400n)) throw new Error(`f${width} literal overflow: ${text}`);
    if (order < (hex ? -1200n : -400n)) numerator = 0n;
    if (numerator !== 0n) {
      const factor = (hex ? 2n : 10n) ** (power < 0n ? -power : power);
      if (power >= 0n) numerator *= factor;
      else denominator = factor;
    }
    if (numerator === 0n) {
      bits = 0n;
    } else {
      let exp = numerator.toString(2).length - denominator.toString(2).length;
      if (exp >= 0 ? numerator < denominator << BigInt(exp) : numerator << BigInt(-exp) < denominator) exp--;
      // Round once at the target precision, including gradual underflow.
      const unit = Math.max(exp, 1 - bias) - fraction;
      const rounded = unit >= 0
        ? roundRatio(numerator, denominator << BigInt(unit))
        : roundRatio(numerator << BigInt(-unit), denominator);
      let significand = rounded;
      let encodedExp = Math.max(exp + bias, 1);
      if (significand >= 1n << BigInt(fraction + 1)) {
        significand >>= 1n;
        encodedExp++;
      }
      if (encodedExp >= 2 ** exponent - 1) throw new Error(`f${width} literal overflow: ${text}`);
      bits = significand < 1n << BigInt(fraction)
        ? significand
        : (BigInt(encodedExp) << BigInt(fraction)) | (significand - (1n << BigInt(fraction)));
    }
  }
  bits |= sign;
  const bytes = Buffer.alloc(width / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number(bits & 0xffn);
    bits >>= 8n;
  }
  return bytes;
}

module.exports = { quoteWatFloat, encodeWatFloat };
