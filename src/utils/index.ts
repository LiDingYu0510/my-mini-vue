export function isObject(target) {
    return typeof target === 'object' && target !== null
}

export function hasChange(oldValue, newValue) {
    return oldValue !== newValue && !(Number.isNaN(oldValue) && Number.isNaN(newValue))
}

export function isArray(target) {
    return Array.isArray(target)
}

export function isFunction(target) {
    return typeof target == 'function'
}