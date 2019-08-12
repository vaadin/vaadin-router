(({POPSTATE}) => {
  describe('NavigationTriggers.POPSTATE', () => {
    let pathname, search, hash;
    before(() => {
      pathname = window.location.pathname;
      search = window.location.search;
      hash = window.location.hash;
    });

    after(() => {
      window.history.pushState(null, null, pathname + search + hash);
    });

    it('should expose the NavigationTrigger API', () => {
      expect(POPSTATE).to.have.property('activate').that.is.a('function');
      expect(POPSTATE).to.have.property('inactivate').that.is.a('function');
    });

    it('should translate `popstate` events into `vaadin-router-go` when activated', () => {
      POPSTATE.inactivate();
      const spy = sinon.spy();
      window.addEventListener('vaadin-router-go', spy);
      POPSTATE.activate();
      window.history.pushState(null, null, '/test-url?search#hash');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.removeEventListener('vaadin-router-go', spy);
      expect(spy).to.have.been.called.once;
      expect(spy.args[0][0]).to.have.property('type', 'vaadin-router-go');
      expect(spy.args[0][0]).to.have.deep.property('detail.pathname', '/test-url');
      expect(spy.args[0][0]).to.have.deep.property('detail.search', '?search');
      expect(spy.args[0][0]).to.have.deep.property('detail.hash', '#hash');
    });

    it('should ignore `popstate` events with the `vaadin-router-ignore` state', () => {
      POPSTATE.inactivate();
      const spy = sinon.spy();
      window.addEventListener('vaadin-router-go', spy);
      POPSTATE.activate();
      window.history.pushState(null, null, '/test-url');
      window.dispatchEvent(new PopStateEvent('popstate', {state: 'vaadin-router-ignore'}));
      window.removeEventListener('vaadin-router-go', spy);
      expect(spy).to.not.have.been.called;
    });

    it('should not translate `popstate` events into `vaadin-router-go` when inactivated', () => {
      POPSTATE.activate();
      POPSTATE.inactivate();
      const spy = sinon.spy();
      window.addEventListener('vaadin-router-go', spy);
      window.history.pushState(null, null, '/test-url');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.removeEventListener('vaadin-router-go', spy);
      expect(spy).to.not.have.been.called;
    });
  });
})(VaadinTestNamespace);
