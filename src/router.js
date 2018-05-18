import Resolver from './resolver/resolver.js';
import setNavigationTriggers from './triggers/setNavigationTriggers.js';
import POPSTATE from './triggers/popstate.js';

function resolveRoute(context, params) {
  const route = context.route;
  // TODO(vlukashov): export this from UniversalRouter
  if (typeof route.redirect === 'string') {
    return {redirect: {pathname: route.redirect, from: context.pathname, params}};
  } else if (typeof route.action === 'function') {
    return route.action(context, params);
  } else if (typeof route.component === 'string') {
    return Router.renderComponent(route.component, context);
  }
}

/**
 * @typedef Route
 * @type {object}
 * @property {!string} path
 * @property {?string} component
 * @property {?string} importUrl
 * @property {?function(context, next)} action
 * @property {?Array<Route>} children
 */

/**
 * A simple client-side router for single-page applications. It uses
 * express-style middleware and has a first-class support for Web Components and
 * lazy-loading. Works great in Polymer and non-Polymer apps.
 *
 * ### Basic example
 * ```
 * import {Router} from '@vaadin/router';
 *
 * const router = new Router(document.getElementById('outlet'));
 * router.setRoutes([
 *   {path: '/', component: 'x-home-view'},
 *   {path: '/users', component: 'x-user-list'}
 * ]);
 * ```
 *
 * ### Lazy-loading example
 * A bit more involved example with lazy-loading:
 * ```
 * import {Router} from '@vaadin/router';
 *
 * const routes = [
 *   {path: '/', component: 'x-home-view'},
 *   {
 *     path: '/users',
 *     bundle: 'bundles/user-bundle.html',
 *     children: [
 *       {path: '/', component: 'x-user-list'},
 *       {path: '/:user', component: 'x-user-profile'}
 *     ]
 *   }
 * ];
 *
 * const router = new Router(document.getElementById('outlet'));
 * router.setRoutes(routes);
 * ```
 *
 * ### Middleware example
 * A more complex example with custom route handlers and server-side rendered
 * content:
 * ```
 * import {Router} from '@vaadin/router';
 *
 * const routes = [
 *   {
 *     path: '/',
 *     action: async (context) => {
 *       // record the navigation completed event for analytics
 *       analytics.recordNavigationStart(context.path);
 *
 *       // let the navigation happen and wait for the result
 *       const result = await context.next();
 *
 *       // record the navigation completed event for analytics
 *       analytics.recordNavigationEnd(context.path, result.status);
 *
 *       // pass the result up the handlers chain
 *       return result;
 *     }
 *   },
 *   {
 *     path: '/',
 *     component: 'x-home-view'
 *   },
 *   {
 *     path: '/users',
 *     bundle: 'bundles/user-bundle.html',
 *     children: [
 *       {path: '/', component: 'x-user-list'},
 *       {path: '/:user', component: 'x-user-profile'}
 *     ]
 *   },
 *   {
 *     path: '/server',
 *     action: async (context) => {
 *       // fetch the server-side rendered content
 *       const result = await fetch(context.path, {...});
 *
 *       // modify the content if necessary
 *       result.body = result.body.replace(/bad/ig, 'good');
 *
 *       // create DOM objects out of the server-side result (string)
 *       return renderToDom(result);
 *     }
 *   }
 * ];
 *
 * const router = new Router(document.getElementById('outlet'));
 * router.setRoutes(routes);
 * ```
 *
 * @memberof Vaadin
 * @extends Vaadin.Resolver
 * @demo demo
 * @summary JavaScript class that renders different DOM content depending on
 *    a given path. It can re-render when triggered or automatically on
 *    'popstate' and / or 'click' events.
 */
export class Router extends Resolver {

  /**
   * Creates a new Router instance with a given outlet, and
   * automatically subscribes it to navigation events on the `window`.
   * Using a constructor argument or a setter for outlet is equivalent:
   *
   * ```
   * const router = new Vaadin.Router();
   * router.setOutlet(outlet);
   * ```
   *
   * @param {?Node} outlet
   * @param {?RouterOptions} options
   */
  constructor(outlet, options) {
    super([], Object.assign({resolveRoute}, options));

    /**
     * A promise that is settled after the current render cycle completes. If
     * there is no render cycle in progress the promise is immediately settled
     * with the last render cycle result.
     *
     * @public
     * @type {!Promise<?Node>}
     */
    this.ready;
    this.ready = Promise.resolve(outlet);

    this.__lastStartedRenderId = 0;
    this.__navigationEventHandler = this.__onNavigationEvent.bind(this);
    this.setOutlet(outlet);
    this.subscribe();
  }

  /**
   * Sets the router outlet (the DOM node where the content for the current
   * route is inserted). Any content pre-existing in the router outlet is
   * removed at the end of each render pass.
   *
   * @param {?Node} outlet the DOM node where the content for the current route
   *     is inserted.
   */
  setOutlet(outlet) {
    if (outlet) {
      this.__ensureOutlet(outlet);
    }
    this.__outlet = outlet;
  }

  /**
   * Returns the current router outlet. The initial value is `undefined`.
   *
   * @return {?Node} the current router outlet (or `undefined`)
   */
  getOutlet() {
    return this.__outlet;
  }

  /**
   * Sets the routing config (replacing the existing one) and triggers a
   * navigation event so that the router outlet is refreshed according to the
   * current `window.location` and the new routing config.
   *
   * @param {!Array<!Route>|!Route} routes a single route or an array of those
   */
  setRoutes(routes) {
    super.setRoutes(routes);
    this.__onNavigationEvent();
  }

  /**
   * Asynchronously resolves the given pathname and renders the resolved route
   * component into the router outlet. If no router outlet is set at the time of
   * calling this method, or at the time when the route resolution is completed,
   * a `TypeError` is thrown.
   *
   * Returns a promise that is fulfilled with the router outlet DOM Node after
   * the route component is created and inserted into the router outlet, or
   * rejected if no route matches the given path.
   *
   * If another render pass is started before the previous one is completed, the
   * result of the previous render pass is ignored.
   *
   * @param {!string|!{pathname: !string}} pathnameOrContext the pathname to
   *    render or a context object with a `pathname` property and other
   *    properties to pass to the resolver.
   * @return {!Promise<!Node>}
   */
  render(pathnameOrContext, shouldUpdateHistory) {
    this.__ensureOutlet();
    const renderId = ++this.__lastStartedRenderId;
    this.ready = this.resolve(pathnameOrContext)
      .then(result => {
        if (result instanceof HTMLElement) {
          return result;
        } else if (result.redirect) {
          const redirect = result.redirect;
          return this.resolve({
            pathname: Router.pathToRegexp.compile(redirect.pathname)(redirect.params),
            from: redirect.from
          });
        }
      })
      .then(element => {
        if (renderId === this.__lastStartedRenderId) {
          if (shouldUpdateHistory) {
            this.__updateBrowserHistory(element.route.pathname);
          }
          this.__setOutletContent(element);
          return this.__outlet;
        }
      })
      .catch(error => {
        if (renderId === this.__lastStartedRenderId) {
          if (shouldUpdateHistory) {
            this.__updateBrowserHistory(pathnameOrContext);
          }
          this.__setOutletContent();
          throw error;
        }
      });
    return this.ready;
  }

  __ensureOutlet(outlet = this.__outlet) {
    if (!(outlet instanceof Node)) {
      throw new TypeError(`expected router outlet to be a valid DOM Node (but got ${outlet})`);
    }
  }

  __updateBrowserHistory(pathnameOrContext) {
    const pathname = pathnameOrContext.pathname || pathnameOrContext;
    if (window.location.pathname !== pathname) {
      window.history.pushState(null, document.title, pathname);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  __setOutletContent(element) {
    this.__ensureOutlet();
    const children = this.__outlet.children;
    if (children && children.length) {
      const parent = children[0].parentNode;
      for (let i = 0; i < children.length; i += 1) {
        parent.removeChild(children[i]);
      }
    }
    if (element) {
      this.__outlet.appendChild(element);
    }
  }

  /**
   * Subscribes this instance to navigation events on the `window`.
   *
   * NOTE: beware of resource leaks. For as long as a router instance is
   * subscribed to navigation events, it won't be garbage collected.
   */
  subscribe() {
    window.addEventListener('vaadin-router:navigate',
      this.__navigationEventHandler);
  }

  /**
   * Removes the subscription to navigation events created in the `subscribe()`
   * method.
   */
  unsubscribe() {
    window.removeEventListener('vaadin-router:navigate',
      this.__navigationEventHandler);
  }

  __onNavigationEvent(event) {
    const pathname = event ? event.detail.pathname : window.location.pathname;
    if (this.root.children.length > 0) {
      this.render(pathname, true);
    }
  }

  /**
   * Creates and returns an instance of a given custom element.
   *
   * @param {!string} component tag name of a web component to render
   * @param {?context} context an optional context object
   * @return {!HTMLElement}
   * @protected
   */
  static renderComponent(component, context) {
    const element = document.createElement(component);
    const params = Object.assign({}, context.params);
    element.route = {params, pathname: context.pathname};
    if (context.from) {
      element.route.redirectFrom = context.from;
    }
    return element;
  }

  /**
   * Configures what triggers Vaadin.Router navigation events:
   *  - `POPSTATE`: popstate events on the current `window`
   *  - `CLICK`: click events on `<a>` links leading to the current page
   *
   * The default is `POPSTATE`. Below is an example of how to switch to `CLICK`:
   *
   * ```
   * import {Router} from '@vaadin/router';
   * import CLICK from '@vaadin/router/triggers/click';
   *
   * Router.setTriggers(CLICK);
   * // the triggers can also be combined:
   * // Router.setTriggers(CLICK, POPSTATE);
   * ```
   *
   * The `POPSTATE` and `CLICK` navigation triggers need to be imported
   * separately to enable efficient tree shaking: if the app does not use `<a>`
   * clicks as navigation triggers, the code to handle them is not included into
   * the bundle.
   *
   * @param {...NavigationTrigger} triggers
   */
  static setTriggers(...triggers) {
    setNavigationTriggers(triggers);
  }
}

Router.NavigationTrigger = {POPSTATE};
Router.setTriggers(POPSTATE);
