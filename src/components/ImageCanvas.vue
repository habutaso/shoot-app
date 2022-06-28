<template>
  <img id=photoId :src=objurl alt="">
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onBeforeUnmount } from '@vue/composition-api'

export default defineComponent ({
  props: {
    blob: {
      type: Blob,
      required: true
    },
    photoId: {
      type: String,
      required: true
    }
  },
  setup (props, _) {
    window.URL = window.URL || window.webkitURL
    const objurl = ref<string>('')
    const log = () => {
      console.log(objurl.value)
    }
    onMounted(() => {
      objurl.value = window.URL.createObjectURL(props.blob)
      log()
    })
    onBeforeUnmount(() => {
      window.URL.revokeObjectURL(objurl.value)
      objurl.value = ''
    })
    return {
      objurl
    }
  }
})
</script>

<style scoped>
img {
  width: 70px;
  height: 70px;
}
</style>