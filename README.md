# Raw log viewer for EmailEngine

[EmailEngine](https://emailengine.app/) logs all output in Pino format. If `EENGINE_LOG_RAW=true` environment variable or `--log.raw=true` argument is set then EmailEngine also includes raw data sent to and read from the IMAP socket. This utility displays these logs in human readable form.

```
$ npm install eerawlog -g
$ EENGINE_LOG_RAW=true emailengine | eerawlog
```

![](https://cldup.com/0z5i7LU-_A.png)
