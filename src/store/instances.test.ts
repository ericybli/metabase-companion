import { useInstancesStore } from './instances';
import type { Instance } from '../auth/types';

const inst = (id: string): Instance => ({
  id,
  baseUrl: `https://${id}.example.com`,
  siteName: `Site ${id}`,
  version: 'v0.48.0',
});

beforeEach(() => {
  useInstancesStore.setState({ instances: [], activeInstanceId: null });
});

describe('useInstancesStore', () => {
  it('starts empty with no active instance', () => {
    const s = useInstancesStore.getState();
    expect(s.instances).toEqual([]);
    expect(s.activeInstanceId).toBeNull();
  });

  it('addInstance appends an instance', () => {
    useInstancesStore.getState().addInstance(inst('a'));
    expect(useInstancesStore.getState().instances).toEqual([inst('a')]);
  });

  it('addInstance replaces an existing instance with the same id', () => {
    useInstancesStore.getState().addInstance(inst('a'));
    useInstancesStore.getState().addInstance({ ...inst('a'), siteName: 'Renamed' });
    const { instances } = useInstancesStore.getState();
    expect(instances).toHaveLength(1);
    expect(instances[0]?.siteName).toBe('Renamed');
  });

  it('setActiveInstance sets the active id', () => {
    useInstancesStore.getState().addInstance(inst('a'));
    useInstancesStore.getState().setActiveInstance('a');
    expect(useInstancesStore.getState().activeInstanceId).toBe('a');
  });

  it('setActiveInstance(null) clears the active id', () => {
    useInstancesStore.getState().setActiveInstance('a');
    useInstancesStore.getState().setActiveInstance(null);
    expect(useInstancesStore.getState().activeInstanceId).toBeNull();
  });

  it('removeInstance removes by id', () => {
    useInstancesStore.getState().addInstance(inst('a'));
    useInstancesStore.getState().addInstance(inst('b'));
    useInstancesStore.getState().removeInstance('a');
    expect(useInstancesStore.getState().instances.map((i) => i.id)).toEqual(['b']);
  });

  it('removeInstance clears active id when the removed instance was active', () => {
    useInstancesStore.getState().addInstance(inst('a'));
    useInstancesStore.getState().setActiveInstance('a');
    useInstancesStore.getState().removeInstance('a');
    expect(useInstancesStore.getState().activeInstanceId).toBeNull();
  });

  it('removeInstance leaves active id untouched when a different instance was active', () => {
    useInstancesStore.getState().addInstance(inst('a'));
    useInstancesStore.getState().addInstance(inst('b'));
    useInstancesStore.getState().setActiveInstance('b');
    useInstancesStore.getState().removeInstance('a');
    expect(useInstancesStore.getState().activeInstanceId).toBe('b');
  });
});
