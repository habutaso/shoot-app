<template>
  <div class="home">
    <Shooter @shooted=shootedFunc />
    <button @click=toggleThumbnail>toggle thumbnail</button>
    <p>file quantity{{blobs.length}}</p>
    <Thumbnail v-if=isShow :isShow=isShow :blobs=blobs />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'
import Shooter from '@/components/Shooter.vue'
import Thumbnail from '@/components/Thumbnail.vue'
import { photoDB, PhotoState, PhotoStateInIDB } from '@/modules/PhotoDB2'

export default defineComponent({
  name: 'HomeView',
  components: {
    Shooter,
    Thumbnail
  },
  setup (props, context) {
    const blobs = ref<any>([])
    const isShow = ref<boolean>(true)
    /**
     * PhotoStateInIDBからPhotoStateに変換する
     * mobile iOSのindexedDBから取ってきた画像arraybufferをblobに変換して出力
     * @param state PhotoStateInIDB
     * @returns PhotoState
     */
    const convertInToOut = (state: PhotoStateInIDB): PhotoState => {
      return { ...state, blob: new Blob([state.blob], { type: state.mime }) }
    }
    const queryPrefixMatch = async (key: string): Promise<Array<PhotoState>> => {
      const ret = await photoDB.photostate.where('fileName').startsWith(key).toArray()
      if (ret.length < 1) {
        return []
      }
      return ret.map((item: PhotoStateInIDB) => convertInToOut(item))
    }
    const getItem = async (key: string): Promise<PhotoState | undefined> => {
    const ret = await photoDB.photostate.get({ fileName: key })
    if (!ret) return
    return convertInToOut(ret)
  }
    const shootedFunc = async (fileName: string) => {
      // console.log(fileName)
      // await getItem(fileName)
      //   .then((ret: PhotoState | undefined) => { blobs.value = ret === undefined ? blobs.value: [...blobs.value, ret] })
    }
    const toggleThumbnail = () => {
      isShow.value = !isShow.value
      console.log("toggled")
    }
    return {
      blobs,
      isShow,
      shootedFunc,
      toggleThumbnail
    }
  }
});
</script>
