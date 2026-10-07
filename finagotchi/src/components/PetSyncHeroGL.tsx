import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { colors, radius } from '../theme/tokens';

/**
 * The 3D teardrop hero — ONLY imported (lazily, by PetSyncHero) when the
 * ExpoGL native module is present: expo-gl's JS throws at module scope on
 * runtimes that lack it.
 *
 * Plain three over GLView (no expo-three): the renderer gets a minimal canvas
 * shim over the Expo GL context, frames end with gl.endFrameEXP().
 */
export default function PetSyncHeroGL({ size = 140 }: { size?: number }) {
    const [failed, setFailed] = useState(false);
    const frame = useRef(0);

    useEffect(
        () => () => {
            // Sheet closed: stop the render loop.
            cancelAnimationFrame(frame.current);
        },
        []
    );

    if (failed) return null;

    async function onContextCreate(gl: ExpoWebGLRenderingContext) {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        const renderer = new THREE.WebGLRenderer({
            canvas: {
                width,
                height,
                style: {},
                clientHeight: height,
                addEventListener: () => {},
                removeEventListener: () => {},
                getContext: () => gl,
            } as unknown as HTMLCanvasElement,
            context: gl as unknown as WebGL2RenderingContext,
        });
        renderer.setSize(width, height, false);
        renderer.setClearColor(new THREE.Color(colors.background), 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
        camera.position.set(0, 0.25, 3.4);
        camera.lookAt(0, 0, 0);

        // Theme lighting: dim navy ambient, cyan key, purple rim.
        scene.add(new THREE.AmbientLight(0x162640, 1.6));
        const key = new THREE.DirectionalLight(0x35d7ff, 2.2);
        key.position.set(2, 3, 4);
        scene.add(key);
        const rim = new THREE.PointLight(0x9945ff, 6, 20);
        rim.position.set(-2.5, 1, -2);
        scene.add(rim);

        const group = new THREE.Group();
        scene.add(group);

        try {
            const asset = Asset.fromModule(
                require('../../assets/teardrop.glb')
            );
            await asset.downloadAsync();
            const uri = asset.localUri ?? asset.uri;
            const buffer = await (await fetch(uri)).arrayBuffer();
            const gltf = await new Promise<
                import('three/examples/jsm/loaders/GLTFLoader.js').GLTF
            >((resolve, reject) => {
                new GLTFLoader().parse(buffer, '', resolve, reject);
            });

            // The GLB is a bare Blender export (no materials): center it,
            // normalize its size, and give it the app's pearly finish.
            const mesh = gltf.scene;
            const material = new THREE.MeshStandardMaterial({
                color: 0xf5f9ff,
                roughness: 0.3,
                metalness: 0.15,
            });
            mesh.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).material = material;
                }
            });
            const box = new THREE.Box3().setFromObject(mesh);
            const center = box.getCenter(new THREE.Vector3());
            const extent = box.getSize(new THREE.Vector3());
            const scale = 1.7 / Math.max(extent.x, extent.y, extent.z);
            mesh.position.sub(center);
            mesh.scale.setScalar(scale);
            group.add(mesh);
        } catch (e) {
            console.warn('[PetSyncHero] teardrop load failed:', e);
            setFailed(true);
            return;
        }

        let last = Date.now();
        const start = last;
        const tick = () => {
            frame.current = requestAnimationFrame(tick);
            const now = Date.now();
            const delta = Math.min(0.1, (now - last) / 1000);
            last = now;
            const t = (now - start) / 1000;

            // Slow spin + gentle bob.
            group.rotation.y += delta * 0.7;
            group.position.y = Math.sin(t * 1.4) * 0.07;
            group.rotation.x = 0.08 + Math.sin(t * 0.9) * 0.03;

            renderer.render(scene, camera);
            gl.endFrameEXP();
        };
        tick();
    }

    return (
        <View style={[styles.frame, { width: size, height: size }]}>
            <GLView style={styles.gl} onContextCreate={onContextCreate} />
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        alignSelf: 'center',
        borderRadius: radius.lg,
        overflow: 'hidden',
    },
    gl: {
        flex: 1,
    },
});
