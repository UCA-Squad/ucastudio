STATIC_RECORD_FOLDER=./static/records/*/*
seven_days=$(date -d '1 days ago' +%s)
for f in $STATIC_RECORD_FOLDER; do
   [ -d "$f" ] || continue 
   timestampCurrentFolder=$(stat -c '%Y' $f)
   (( timestampCurrentFolder <  seven_days)) && echo rm -r "$f"
done