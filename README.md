# Raw log viewer for EmailEngine

[EmailEngine](https://emailengine.app/) logs all output in Pino format. If `EENGINE_LOG_RAW=true` environment variable or `--log.raw=true` argument is set then EmailEngine also includes raw data sent to and read from the IMAP socket. This utility displays these logs in human readable form.

```
$ npm install eerawlog -g
$ EENGINE_LOG_RAW=true emailengine | eerawlog
```

### Filtering output

You can filter by the keys listed in log entries by adding a cli argument `--filter.[key]="value"`. If you want to include multiple values, set the same keyword multiple times.

**Example.** Only display IMAP traffic from accounts `"account1"` and `"account2"`

```
$ EENGINE_LOG_RAW=true emailengine | eerawlog --filter.account="account1" --filter.account="account2"
```

### Example screenshot

![](https://cldup.com/0z5i7LU-_A.png)
