declare module 'react-native-webp-format' {
    import { Component } from 'react';
    import { ImageProps, ImageStyle } from 'react-native';

    export class Image extends Component<ImageProps & { style?: ImageStyle }> {}
}
