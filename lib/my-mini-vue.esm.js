function isObject(target) {
    return typeof target === 'object' && target !== null;
}
function hasChange(oldValue, newValue) {
    return oldValue !== newValue && !(Number.isNaN(oldValue) && Number.isNaN(newValue));
}
function isArray(target) {
    return Array.isArray(target);
}
function isFunction(target) {
    return typeof target == 'function';
}

var activeEffect; // global var for memorize effect
var effectStack = [];
function watchEffect(func, options) {
    if (options === void 0) { options = {}; }
    var watchFunc = function () {
        try {
            activeEffect = watchFunc; //循環依賴？還是只是把heap指針傳到全局變量？
            effectStack.push(activeEffect);
            return func();
        }
        finally {
            effectStack.pop();
            activeEffect = effectStack[effectStack.length - 1];
        }
    };
    if (!options.lazy) {
        watchFunc();
    }
    if (options.scheduler) {
        watchFunc.scheduler = options.scheduler;
    }
    return watchFunc;
}
/**
 * targetMap 收集side-effect，並建立副作用和依賴之間的關係
 *
 * 一個副作用對象可能依賴多個響應式對象、
 * 一個響應式對象裡可能有多個屬性
 *
 * 因此targetMap結構設計如下：
 * { //an WeakMap
 *  [target]:{   // key是reactiveObj，value是一個object
 *      [key]:[] // key是reactiveObj 的鍵值，value是一個set，在set存儲副作用
 *               // 使用Set，是因為它可以存儲唯一值
 *  }
 * }
 *
 * 而使用weakmap的原因，是因為當reactive對象不存在後，weakmap會自動GC
 */
var targetMap = new WeakMap(); //WeakMap只接受object當作key
function watchTrack(target, key) {
    if (!activeEffect)
        return;
    var depsMap = targetMap.get(target);
    // 假如沒有==init state，targetMap中創建new Map
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }
    var deps = depsMap.get(key);
    // 假如沒有==init state，depsMap 中創建new Set
    if (!deps) {
        depsMap.set(key, (deps = new Set()));
    }
    deps.add(activeEffect); // 建立依賴關係
}
function watchTrigger(target, key) {
    var depsMap = targetMap.get(target);
    if (!depsMap)
        return;
    var deps = depsMap.get(key);
    if (!deps)
        return;
    deps.forEach(function (effectFunc) {
        if (effectFunc.scheduler) {
            effectFunc.scheduler(effectFunc);
        }
        else {
            effectFunc();
        }
    });
}

// in order to memorize
// 但基本上沒什麼用，因為在創建reactive時，是直接用創建的object
var proxyMap = new WeakMap();
function reactive(target) {
    // if target is not an object, just return?
    if (!isObject(target))
        return target;
    if (isReactive(target))
        return target;
    if (proxyMap.has(target)) {
        return proxyMap.get(target);
    }
    var proxy = new Proxy(target, {
        get: function (target, key, receiver) {
            if (key == '__isReactive')
                return true;
            var res = Reflect.get(target, key, receiver);
            watchTrack(target, key);
            //return res // 這個只代理了一層
            return isObject(res) ? reactive(res) : res; // 不是object的話，不會被依賴（watchEffect 到）
        },
        set: function (target, key, newValue, receiver) {
            var oldValue = target[key];
            var oldLength = target.length;
            var res = Reflect.set(target, key, newValue, receiver);
            // watchEffect trigger area
            if (hasChange(oldValue, newValue)) {
                watchTrigger(target, key);
                if (isArray(target) && hasChange(oldLength, target.length)) {
                    console.log('target.length, inside trigger:', target.length);
                    watchTrigger(target, 'length');
                }
            }
            return res;
        },
    });
    proxyMap.set(target, proxy);
    return proxy;
}
function isReactive(target) {
    return !!(target && target.__isReactive);
}

function ref(value) {
    if (isRef(value))
        return value;
    return new RefImpl(value);
}
function isRef(value) {
    return !!(value && value._isRef);
}
var RefImpl = /** @class */ (function () {
    function RefImpl(value) {
        this._isRef = true;
        this._value = isObject(value) ? reactive(value) : value;
    }
    Object.defineProperty(RefImpl.prototype, "value", {
        get: function () {
            watchTrack(this, 'value');
            return this._value;
        },
        set: function (newValue) {
            if (hasChange(newValue, this._value)) {
                watchTrigger(this, 'value');
                this._value = isObject(newValue) ? reactive(newValue) : newValue;
            }
        },
        enumerable: false,
        configurable: true
    });
    return RefImpl;
}());

function computed(getterOrObject) {
    var getter, setter;
    if (isFunction(getterOrObject)) {
        getter = getterOrObject;
        setter = function () {
            console.warn('computed value is readonly');
        };
    }
    else {
        getter = getterOrObject.getter;
        setter = getterOrObject.setter;
    }
    return new ComplutedImpl(getter, setter);
}
var ComplutedImpl = /** @class */ (function () {
    function ComplutedImpl(getter, setter) {
        var _this = this;
        this._value = undefined;
        this._setter = setter;
        this._dirty = true; // 依賴有沒有更新的flag
        this.effect = watchEffect(getter, {
            lazy: true,
            scheduler: function () {
                if (!_this._dirty) {
                    _this._dirty = true;
                    watchTrigger(_this, 'value');
                }
            },
        });
    }
    Object.defineProperty(ComplutedImpl.prototype, "value", {
        get: function () {
            if (this._dirty) {
                // re-calculate value
                this._value = this.effect(); // 重新計算
                this._dirty = false;
                watchTrack(this, 'value');
            }
            return this._value;
        },
        set: function (newValue) {
            this._setter(newValue);
        },
        enumerable: false,
        configurable: true
    });
    return ComplutedImpl;
}());

var observe1 = (window.observed = reactive({ count1: 1, count2: 2 }));
var observeArr = (window.observedArr = reactive([1]));
var observeRef = (window.observedRef = ref(1));
(window.computedData = computed(function () {
    console.log('computed!');
    return observeRef.value * 2;
}));
watchEffect(function () {
    console.log("current value: ".concat(observeRef.value));
});
watchEffect(function () {
    console.log("current arr length: ".concat(observeArr.length));
});
watchEffect(function () {
    watchEffect(function () {
        console.log("---watchEffect--count2:".concat(observe1.count2));
    });
    console.log("---watchEffect--count1:".concat(observe1.count1));
});