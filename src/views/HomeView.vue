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
import { PhotoDB, PhotoState } from '@/modules/PhotoDB'

export default defineComponent({
  name: 'HomeView',
  components: {
    Shooter,
    Thumbnail
  },
  setup (props, context) {
    const blobs = ref<any>([])
    const photoDB = PhotoDB.instance()
    const isShow = ref<boolean>(true)
    const shootedFunc = async () => {
      await photoDB.queryThumbnail('photo')
        .then((ret: PhotoState[]) => { blobs.value = ret })
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
