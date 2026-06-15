import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

// Proves the jest-expo + React Native Testing Library harness works.
// NOTE: render() may be synchronous (RNTL 13) or async (RNTL 14); awaiting it is safe either way.
describe('test harness', () => {
  it('renders a component', async () => {
    await render(<Text>hello</Text>);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
