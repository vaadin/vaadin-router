export function toArray(objectOrArray) {
  objectOrArray = objectOrArray || [];
  return Array.isArray(objectOrArray) ? objectOrArray : [objectOrArray];
}

export function log(msg) {
  return `[Vaadin.Router] ${msg}`;
}

export function ensureRoute(route) {
  if (!route || !isString(route.path)) {
    throw new Error(
      log(`Expected route config to be an object with a "path" string property, or an array of such objects`)
    );
  }

  const stringKeys = ['component', 'redirect'];
  if (
    !isFunction(route.action) &&
    !Array.isArray(route.children) &&
    !isFunction(route.children) &&
    !isObject(route.bundle) &&
    !stringKeys.some(key => isString(route[key]))
  ) {
    throw new Error(
      log(
        `Expected route config "${route.path}" to include either "${stringKeys.join('", "')}" ` +
        `or "action" function but none found.`
      )
    );
  }

  if (route.bundle && (!isString(route.bundle.url) || !route.bundle.url.match(/.+\.js$/))) {
    throw new Error(
      log(`Unsupported type for bundle "${route.bundle.url}": .js expected.`)
    );
  }

  if (route.redirect) {
    ['bundle', 'component'].forEach(overriddenProp => {
      if (overriddenProp in route) {
        console.warn(
          log(
            `Route config "${route.path}" has both "redirect" and "${overriddenProp}" properties, ` +
            `and "redirect" will always override the latter. Did you mean to only use "${overriddenProp}"?`
          )
        );
      }
    });
  }
}

export function ensureRoutes(routes) {
  toArray(routes).forEach(route => ensureRoute(route));
}

// TODO replace this with dynamic import after https://github.com/vaadin/vaadin-router/issues/34 is done
export function loadBundle(bundle) {
  const path = bundle.url;
  let script = document.head.querySelector('script[src="' + path + '"][async]');
  if (script && script.parentNode === document.head) {
    if (script.__dynamicImportLoaded) {
      return Promise.resolve();
    } else {
      return new Promise((resolve, reject) => {
        const originalOnLoad = script.onload;
        script.onreadystatechange = script.onload = e => {
          originalOnLoad();
          resolve(e);
        };

        const originalOnError = script.onerror;
        script.onerror = e => {
          originalOnError();
          reject(e);
        };
      });
    }
  }
  return new Promise((resolve, reject) => {
    script = document.createElement('script');
    script.setAttribute('src', path);
    if (bundle.type === 'module') {
      script.setAttribute('type', 'module');
    }
    script.async = true;
    script.onreadystatechange = script.onload = e => {
      script.__dynamicImportLoaded = true;
      resolve(e);
    };
    script.onerror = e => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(e);
    };
    document.head.appendChild(script);
  });
}

export function fireRouterEvent(type, detail) {
  window.dispatchEvent(
    new CustomEvent(
      `vaadin-router-${type}`, {detail}));
}

export function isObject(o) {
  return typeof o === 'object';
}

export function isFunction(f) {
  return typeof f === 'function';
}

export function isString(s) {
  return typeof s === 'string';
}
