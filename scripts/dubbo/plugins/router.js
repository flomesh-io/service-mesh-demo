/**
 * Remote service detecting: interface:method(args)
 */
pipy({

})

.import({
  __turnDown: 'main'
})

.export('router', {
  __serviceID: '',
  __service: null,
})

.pipeline('request')
  .handleMessage(
    msg => (
      (iface, version, method, args, reqBody, remoteIndex) => (
        reqBody = Hessian.decode(msg.body),
        iface = reqBody?.[1],
        version = reqBody?.[2],
        method = reqBody?.[3],
        args = reqBody?.[4] || '',
        (iface != undefined && method != undefined) ? (
          __service = {
            iface: iface,
            version: version,
            method: method,
            args: args,
          },
          __serviceID = `${iface}:${method}(${args})`
        ) : (
          __turnDown = true
        ),
        __serviceID && ( // set remote application
          remoteIndex = args.length > 0 ? 6 : 5, //TODO multi args?
          __service['remote'] = reqBody?.[remoteIndex]?.['remote.application']
        )
    ))()
  )