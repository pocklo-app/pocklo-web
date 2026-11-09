const destination = new URL('/picker/embed/', location.origin);
destination.search = location.search;
location.replace(destination.href);
