import { formatDate } from './formatDate';
import { formatColor } from './formatColor';
import { formatNumber } from './formatNumber';
import { formatBoolean } from './formatBoolean';
import { formatToString } from './formatToString';

export function defaultFormat (value, dataType = typeof value) {
    // null guards
    if (value === undefined) {
        return null;
    }
    if (dataType === 'number' && (isNaN(value) || value === 0x7FFFFFFF)) {
        return null;
    }
    if (dataType === 'string' && (value === 'n/a' || value === '\0')) {
        return null;
    }

    if (dataType === 'boolean') {
        return formatBoolean(value);
    }

    if (dataType === 'date') {
        return formatDate(value, false);
    }

    if (dataType === 'number') {
        if (value && (value % 1 !== 0)) {
            return formatNumber(Number(value), false);
        }
    }

    if (dataType === 'color') {
        if (!isNaN(value)) {
            return formatColor(value);
        }
    }

    return formatToString(value, false); // Default
}
