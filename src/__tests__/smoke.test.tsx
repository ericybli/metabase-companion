import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

// Proves the jest-expo + React Native Testing Library harness works.
// NOTE: RNTL 14 made render() async (React 19 concurrent renderer) — always `await` it.
describe('test harness', () => {
  it('renders a component', async () => {
    await render(<Text>hello</Text>);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
