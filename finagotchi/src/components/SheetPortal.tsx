import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { create } from 'zustand';

type SheetPortalState = {
    sheets: Record<string, React.ReactNode>;
    order: string[];
    mount: (id: string, node: React.ReactNode) => void;
    unmount: (id: string) => void;
};

const useSheetPortalStore = create<SheetPortalState>((set) => ({
    sheets: {},
    order: [],
    mount: (id, node) =>
        set((state) => ({
            sheets: { ...state.sheets, [id]: node },
            order: state.order.includes(id)
                ? state.order
                : [...state.order, id],
        })),
    unmount: (id) =>
        set((state) => {
            if (!(id in state.sheets)) return state;
            const sheets = { ...state.sheets };
            delete sheets[id];
            return {
                sheets,
                order: state.order.filter((entry) => entry !== id),
            };
        }),
}));

let nextId = 0;

/**
 * Registers a node with the SheetPortalHost for as long as `node` is
 * non-null. Sheets render through this portal instead of RN's Modal: Modal
 * is a separate native window that draws ABOVE Dynamic's embedded-webview
 * overlay (which lives on the activity decorView), burying Dynamic's
 * signature/export UI under our sheets. In-tree portals stay below it.
 */
export function useSheetPortal(node: React.ReactNode): void {
    const idRef = useRef(`sheet-${++nextId}`);
    const mount = useSheetPortalStore((state) => state.mount);
    const unmount = useSheetPortalStore((state) => state.unmount);

    // No dep array: the host must see the latest node after every render.
    useEffect(() => {
        if (node != null) {
            mount(idRef.current, node);
        } else {
            unmount(idRef.current);
        }
    });

    useEffect(() => {
        const id = idRef.current;
        return () => unmount(id);
    }, [unmount]);
}

/**
 * Renders every portaled sheet at the app root, in mount order. Must sit
 * inside GestureHandlerRootView (gestures) and after the screen content so
 * sheets draw on top of it.
 */
export function SheetPortalHost() {
    const sheets = useSheetPortalStore((state) => state.sheets);
    const order = useSheetPortalStore((state) => state.order);

    if (order.length === 0) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {order.map((id) => (
                <React.Fragment key={id}>{sheets[id]}</React.Fragment>
            ))}
        </View>
    );
}
