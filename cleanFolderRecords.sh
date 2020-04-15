STATIC_RECORD_FOLDER=/var/www/ucastudio/static/records/ucastudio/*
find $STATIC_RECORD_FOLDER -mindepth 1 -type d -mtime +7 -exec rm -Rf {} \;
