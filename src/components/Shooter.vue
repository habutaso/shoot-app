<template>
  <div>
    <input type="file" accept="image/*" capture="camera" @change=onChangeFile />
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted } from '@vue/composition-api'
import { photoDB, PhotoState, PhotoStateInIDB } from '@/modules/PhotoDB2'
import { v4 as uuidv4 } from 'uuid'
import Compressor from 'compressorjs'
export default defineComponent({
  name: 'ShooterComp',
  setup (props, context) {
    /**
     * 画像サイズを軽量化する
     * @param value PhotoState
     * @param quality 画質 0 - 1 の少数
     * @param maxWidth 最大横幅px
     * @param maxHeight 最大縦幅px
     * @returns 
     */
    const compressSub = async (file: Blob, quality = 0.9, maxWidth = 1500, maxHeight = 1500): Promise<Blob> => {
      return new Promise<Blob>((resolve, reject) => {
        new Compressor(file, { quality, maxWidth, maxHeight, success: resolve, error: reject })
      })
    }

    /**
     * 画像サイズを軽量化する
     * @param value PhotoState
     * @param quality 画質 0 - 1 の少数
     * @param maxWidth 最大横幅px
     * @param maxHeight 最大縦幅px
     * @returns 
     */
    const compress = async (value: PhotoState, quality = 0.9, maxWidth = 1500, maxHeight = 1500): Promise<PhotoState> => {
      if (!value.blob.type) {
        value.blob = new Blob([value.blob], { type: value.mime })
      }
      const compressed: Blob = await compressSub(value.blob, quality, maxWidth, maxHeight)
      return { ...value, blob: compressed }
    }
    /**
     * PhotoStateからPhotoStateInIDBに変換する
     * mobile iOSのindexedDBに画像を保存するため、blobからarraybufferに変換する
     * @param state PhotoState
     * @returns PhotoStateInIDB
     */
    const convertOutToIn = async (state: PhotoState): Promise<PhotoStateInIDB> => {
      let arraybuffer: ArrayBuffer = new ArrayBuffer(0)
      await state.blob.arrayBuffer().then(ab => { arraybuffer = ab })
      return { ...state, blob: arraybuffer }
    }

    const putitem = async (record: PhotoState) => {
      const compressed: PhotoState = await compress(record)
      await photoDB.photostate.put(await convertOutToIn(compressed))
    }
    const onChangeFile = async (e: Event | null) => {
      if (!e || !e.target || !(e.target as HTMLInputElement).files) return
      const imageFile = (e.target as HTMLInputElement).files
      if (!imageFile) return 
      const newBlob = new Blob([imageFile[0]])
      const fileName = `photo-${uuidv4()}`
      const item = {
        isOnS3: false,
        s3Operation: 'insert',
        fileName,
        mime: imageFile[0].type,
        isStoredByUser: false,
        expirationDate: Date.now(),
        blob: newBlob
      }
      console.log('item', item)
      const interval = setInterval(() => {
        onChangeFileInterval(item)
      }, 4000)
      context.emit('shooted', fileName)
    }
    const onChangeFileInterval = async (item: any) => {
      const fileName = `photo-${uuidv4()}`
      await putitem({...item, fileName})
      context.emit('shooted', fileName)
    }
    return {
      onChangeFile
    }
  }
})
</script>

<style>

</style>