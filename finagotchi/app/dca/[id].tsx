import { router, useLocalSearchParams } from 'expo-router';

import { BottomSheet } from '../../src/components/BottomSheet';
import { DCADetail } from '../../src/screens/dca/DCADetail';

export default function DcaDetailRoute() {
    const { id } = useLocalSearchParams<{ id?: string }>();

    return (
        <BottomSheet visible onClose={() => router.back()}>
            <DCADetail planId={typeof id === 'string' ? id : ''} />
        </BottomSheet>
    );
}
