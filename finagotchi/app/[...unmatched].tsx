import { Redirect } from 'expo-router';

/**
 * Safety net for deep links that slip past +native-intent.tsx (e.g. a wallet
 * returning to an https path with no matching route): land on home instead
 * of expo-router's "Unmatched route" screen.
 */
export default function UnmatchedRoute() {
    return <Redirect href="/" />;
}
