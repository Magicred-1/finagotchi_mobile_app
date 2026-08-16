// import React from 'react';
// import {
//     Image,
//     StyleSheet,
//     View,
// } from 'react-native';

// import { usePetStore } from '../features/pet/store';

// const pets = {
//     1: require('../../assets/pets/stage-1.png'),
//     2: require('../../assets/pets/stage-2.png'),
//     3: require('../../assets/pets/stage-3.png'),
// };

// export function PetCanvas() {
//     const stage = usePetStore((state) => state.stage);

//     return (
//         <View style={styles.container}>
//         <Image
//             source={pets[stage]}
//             resizeMode="contain"
//             style={styles.pet}
//         />
//         </View>
//     );
// }

// const styles = StyleSheet.create({
//     container: {
//         width: '100%',
//         aspectRatio: 1,
//         alignItems: 'center',
//         justifyContent: 'center',
//     },

//     pet: {
//         width: '90%',
//         height: '90%',
//     },
// });

import React from 'react';
import {
    StyleSheet,
    Text,
    View,
} from 'react-native';

export function PetCanvas() {
    return (
        <View style={styles.container}>
        <View style={styles.pet}>
            <Text style={styles.eyes}>● ●</Text>
            <Text style={styles.body}>🟢</Text>
            <Text style={styles.heart}>♥</Text>
        </View>

        <Text style={styles.label}>
            Finny
        </Text>

        <Text style={styles.stage}>
            Baby • Stage 1
        </Text>
        </View>
    );
    }

    const styles = StyleSheet.create({
    container: {
        width: '100%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    pet: {
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: '#72E45A',
        borderWidth: 8,
        borderColor: '#3BAA43',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },

    eyes: {
        fontSize: 30,
        color: '#07111F',
        letterSpacing: 22,
        marginBottom: 10,
    },

    body: {
        fontSize: 90,
    },

    heart: {
        position: 'absolute',
        top: 25,
        right: 30,
        fontSize: 28,
        color: '#FF647C',
    },

    label: {
        marginTop: 14,
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800',
    },

    stage: {
        marginTop: 4,
        color: '#8FA2B8',
        fontSize: 14,
    },
});