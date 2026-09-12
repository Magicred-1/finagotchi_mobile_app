import { useLocalSearchParams } from 'expo-router';

import { DCADetail } from '../../src/screens/dca/DCADetail';

export default function DcaDetailRoute() {
    const { id } = useLocalSearchParams<{ id?: string }>();

    return <DCADetail planId={typeof id === 'string' ? id : ''} />;
}
